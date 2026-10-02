/* Contrato único de carga: navegador y caché offline aceptan los mismos datos. */
((scope) => {
  "use strict";
  const REQUIRED_CONTROLS = [
    "sourceIntegrity", "cmsActiveAllowlist", "externalFormsIsolation", "canonicalActivityMatching",
    "evidenceHeaderSafety", "surveyHeaderSafety", "columnOrderIndependence", "duplicateResponseResolution",
    "directoryUniqueness", "safeEvidenceLinks", "rowQuarantine", "atomicPublication",
  ];
  // El contrato Python contiene todos estos controles; el número puede crecer.
  function validate(data) {
    const controls = data?.quality?.stabilityControls;
    if (data?.schemaVersion !== 14 || !/^[a-f0-9]{16}$/.test(data.buildVersion || "") || !controls
      || !REQUIRED_CONTROLS.every((key) => controls[key] === true)
      || !Object.values(controls).every((value) => value === true)) throw new Error("Publicación sin controles aprobados.");
    for (const key of ["stores", "activities", "submissions", "dms"]) {
      if (!Array.isArray(data[key])) throw new Error("Falta el catálogo " + key);
    }
    const names = new Set(data.activities.map((item) => item.name));
    const stores = new Map(data.stores.map((item) => [item.ceco, item]));
    if (!names.size || names.has("") || names.has(undefined) || names.size !== data.activities.length
      || !stores.size || stores.size !== data.stores.length || data.summary?.stores !== stores.size
      || data.summary?.activities !== names.size) throw new Error("Catálogos inconsistentes.");
    let completed = 0, expected = 0;
    const validPairs = new Set();
    for (const store of stores.values()) {
      if (typeof store.ceco !== "string" || !/^[0-9]{5}$/.test(store.ceco)
        || !store.activities || !store.applicableActivities) throw new Error("Cruce de tienda inválido.");
      let storeCompleted = 0, storeExpected = 0;
      for (const name of names) {
        if (typeof store.activities[name] !== "boolean" || typeof store.applicableActivities[name] !== "boolean"
          || (store.activities[name] && !store.applicableActivities[name])) throw new Error("Aplicabilidad inválida.");
        storeCompleted += Number(store.activities[name]); storeExpected += Number(store.applicableActivities[name]);
        if (store.activities[name]) validPairs.add(JSON.stringify([store.ceco, name]));
      }
      if (store.completed !== storeCompleted || store.expected !== storeExpected) throw new Error("Totales por tienda inconsistentes.");
      completed += storeCompleted; expected += storeExpected;
    }
    const pairs = new Set();
    for (const item of data.submissions) {
      const pair = JSON.stringify([item.ceco, item.activity]);
      const store = stores.get(item.ceco);
      if (!store || !names.has(item.activity) || pairs.has(pair) || typeof item.valid !== "boolean"
        || item.dm !== store.dm || item.region !== store.region || item.store !== store.store
        || item.valid !== store.activities[item.activity]) throw new Error("Respuesta sin cruce único.");
      if (item.valid) validPairs.delete(pair);
      pairs.add(pair);
    }
    if (validPairs.size || data.summary.completedCompletions !== completed
      || data.summary.expectedCompletions !== expected || data.summary.pendingCompletions !== expected - completed
      || data.summary.notApplicableCompletions !== stores.size * names.size - expected) throw new Error("Totales inconsistentes.");
    return data;
  }
  scope.OPSDashboard = Object.freeze({ validate });
})(globalThis);
