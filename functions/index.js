"use strict";

// Staging implementation only. Do NOT deploy before a private, audited import.
// Browser clients cannot directly write counters or logs (see firestore.rules).
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();
const region = "asia-east1";
const RUN_OPTIONS = { region, memory: "256MiB", maxInstances: 10, timeoutSeconds: 30 };

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "需要重新登入");
  }
  return request.auth.uid;
}

function positiveInteger(value, cap, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > cap) {
    throw new HttpsError("invalid-argument", label + " 數量不正確");
  }
  return value;
}

function parseAchievement(data) {
  const delta = {
    spoke: positiveInteger(data?.spoke, 500, "開口"),
    convert: positiveInteger(data?.convert, 100, "渡眾"),
    joinClass: positiveInteger(data?.joinClass, 100, "入班")
  };
  if (!delta.spoke && !delta.convert && !delta.joinClass) {
    throw new HttpsError("invalid-argument", "請輸入回報數量");
  }
  return delta;
}

function activeSeasonId(snapshot) {
  const value = snapshot.data()?.seasonId;
  if (!snapshot.exists || typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(value)) {
    throw new HttpsError("failed-precondition", "尚未配置有效期別");
  }
  return value;
}

function safeHallId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new HttpsError("failed-precondition", "會員尚未配置公堂識別碼");
  }
  return value;
}

function increments(delta) {
  return {
    spoke: FieldValue.increment(delta.spoke),
    convert: FieldValue.increment(delta.convert),
    joinClass: FieldValue.increment(delta.joinClass)
  };
}

// One transaction means a successful counter update always has its activity log.
// Repeating the same UUID for the same member is idempotent.
exports.submitAchievement = onCall(RUN_OPTIONS, async (request) => {
  const uid = requireAuth(request);
  const payload = request.data || {};
  const requestId = payload.requestId;
  if (typeof requestId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(requestId)) {
    throw new HttpsError("invalid-argument", "缺少回報識別碼");
  }
  const delta = parseAchievement(payload);
  const receiptRef = db.collection("activityLogs").doc(uid + "_" + requestId);
  const profileRef = db.collection("profiles").doc(uid);
  const activeRef = db.doc("system/activeSeason");

  const result = await db.runTransaction(async (tx) => {
    // Firestore transactions require all reads to occur before any writes.
    const existing = await tx.get(receiptRef);
    if (existing.exists) return { success: true, duplicate: true, requestId };

    const profile = await tx.get(profileRef);
    const active = await tx.get(activeRef);
    if (!profile.exists || profile.get("active") !== true) {
      throw new HttpsError("permission-denied", "會員資格未啟用");
    }
    const seasonId = activeSeasonId(active);
    const hallId = safeHallId(profile.get("hallId"));
    const statsRef = db.collection("memberStats").doc(uid);
    const hallRef = db.collection("orchardHalls").doc(seasonId + "_" + hallId);
    const seasonRef = db.collection("orchardSeasons").doc(seasonId);

    // Do not silently create aggregates; import and verify them before cutover.
    const stats = await tx.get(statsRef);
    const hall = await tx.get(hallRef);
    const season = await tx.get(seasonRef);
    if (!stats.exists || !hall.exists || !season.exists ||
        stats.get("seasonId") !== seasonId ||
        hall.get("seasonId") !== seasonId ||
        season.get("seasonId") !== seasonId) {
      throw new HttpsError("failed-precondition", "資料尚未完成校驗，禁止更新");
    }

    tx.create(receiptRef, {
      uid, seasonId, hallId,
      displayName: String(profile.get("displayName") || ""),
      type: "achievement",
      action: "回報成果",
      delta,
      createdAt: FieldValue.serverTimestamp(),
      source: "firebase",
      requestId
    });
    tx.update(statsRef, increments(delta));
    tx.update(hallRef, increments(delta));
    tx.update(seasonRef, increments(delta));
    return { success: true, duplicate: false, requestId, seasonId, delta };
  });
  return result;
});

// One round trip for the orchard instead of separate season and global-log calls.
// Only authorized members receive this overview.
exports.getOrchardOverview = onCall(RUN_OPTIONS, async (request) => {
  requireAuth(request);
  const active = await db.doc("system/activeSeason").get();
  const seasonId = activeSeasonId(active);
  const [season, halls, logs] = await Promise.all([
    db.collection("orchardSeasons").doc(seasonId).get(),
    db.collection("orchardHalls").where("seasonId", "==", seasonId).get(),
    db.collection("activityLogs").where("seasonId", "==", seasonId)
      .orderBy("createdAt", "desc").limit(20).get()
  ]);
  if (!season.exists) throw new HttpsError("failed-precondition", "找不到期別統計");

  const toNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const counts = (doc) => ({
    spoke: toNumber(doc.spoke),
    convert: toNumber(doc.convert),
    joinClass: toNumber(doc.joinClass)
  });
  const hallList = halls.docs.map((doc) => ({
    id: doc.id,
    hallId: doc.get("hallId"),
    name: doc.get("name") || "",
    members: toNumber(doc.get("members")),
    ...counts(doc.data())
  }));
  const logList = logs.docs.map((doc) => {
    const record = doc.data();
    return {
      id: doc.id,
      displayName: record.displayName || "",
      hallId: record.hallId || "",
      action: record.action || "",
      delta: record.delta || {},
      createdAt: record.createdAt?.toDate?.()?.toISOString() || null
    };
  });
  return {
    seasonId,
    seasonName: season.get("name") || "",
    totals: counts(season.data()),
    halls: hallList,
    logs: logList
  };
});
