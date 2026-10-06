/* Contrato único de carga: navegador y caché offline aceptan los mismos datos. */
((scope) => {
  "use strict";
  const REQUIRED_CONTROLS = [
    "sourceIntegrity", "cmsActiveAllowlist", "externalFormsIsolation", "canonicalActivityMatching",
    "evidenceHeaderSafety", "surveyHeaderSafety", "columnOrderIndependence", "duplicateResponseResolution",
    "directoryUniqueness", "safeEvidenceLinks", "rowQuarantine", "atomicPublication",
  ];
  // El contrato Python contiene todos estos controles; el número puede crecer.
  const text = (value) => typeof value === "string" && value.trim().length > 0;
  const percentage = (value, completed, expected) => typeof value === "number" && Number.isFinite(value)
    && value >= 0 && value <= 100 && Math.abs(value - (expected ? completed / expected * 100 : 0)) <= 0.051;
  const reject = (message) => { throw new Error(message); };
  function validate(data) {
    const controls = data?.quality?.stabilityControls;
    if (data?.schemaVersion !== 14 || !/^[a-f0-9]{16}$/.test(data.buildVersion || "") || !controls
      || !REQUIRED_CONTROLS.every((key) => controls[key] === true)
      || !Object.values(controls).every((value) => value === true)) throw new Error("Publicación sin controles aprobados.");
    for (const key of ["stores", "activities", "submissions", "dms", "regions", "quantityModules", "surveyModules"]) {
      if (!Array.isArray(data[key])) throw new Error("Falta el catálogo " + key);
    }
    const names = new Set(data.activities.map((item) => item.name));
    const stores = new Map(data.stores.map((item) => [item.ceco, item]));
    if (!names.size || !data.activities.every((item) => text(item.name)) || names.size !== data.activities.length
      || !stores.size || stores.size !== data.stores.length || data.summary?.stores !== stores.size
      || data.summary?.activities !== names.size) throw new Error("Catálogos inconsistentes.");
    let completed = 0, expected = 0;
    const validPairs = new Set();
    for (const store of stores.values()) {
      if (typeof store.ceco !== "string" || !/^[0-9]{5}$/.test(store.ceco)
        || !text(store.store) || !text(store.dm) || !text(store.region)
        || !store.activities || !store.applicableActivities) throw new Error("Cruce de tienda inválido.");
      let storeCompleted = 0, storeExpected = 0;
      for (const name of names) {
        if (typeof store.activities[name] !== "boolean" || typeof store.applicableActivities[name] !== "boolean"
          || (store.activities[name] && !store.applicableActivities[name])) throw new Error("Aplicabilidad inválida.");
        storeCompleted += Number(store.activities[name]); storeExpected += Number(store.applicableActivities[name]);
        if (store.activities[name]) validPairs.add(JSON.stringify([store.ceco, name]));
      }
      if (store.completed !== storeCompleted || store.expected !== storeExpected
        || store.notApplicable !== names.size - storeExpected
        || !percentage(store.compliance, storeCompleted, storeExpected)) throw new Error("Totales por tienda inconsistentes.");
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
      || data.summary.notApplicableCompletions !== stores.size * names.size - expected
      || data.summary.validResponses !== completed
      || data.summary.storesComplete !== data.stores.filter((item) => item.expected > 0 && item.completed === item.expected).length
      || !percentage(data.summary.compliance, completed, expected)) throw new Error("Totales inconsistentes.");

    const regions = new Set(data.stores.map((item) => item.region));
    if (data.regions.length !== regions.size || new Set(data.regions).size !== regions.size
      || !data.regions.every((region) => regions.has(region)) || data.summary.regions !== regions.size) reject("Regiones inconsistentes.");
    const portfolios = new Map();
    for (const store of stores.values()) {
      if (!portfolios.has(store.dm)) portfolios.set(store.dm, []);
      portfolios.get(store.dm).push(store);
    }
    if (data.dms.length !== portfolios.size || data.summary.dms !== portfolios.size) reject("Catálogo DM incompleto.");
    const seenDms = new Set();
    for (const [index, dm] of data.dms.entries()) {
      const members = portfolios.get(dm.dm);
      if (!members || seenDms.has(dm.dm) || dm.rank !== index + 1) reject("Ranking DM inválido.");
      seenDms.add(dm.dm);
      const done = members.reduce((sum, item) => sum + item.completed, 0);
      const ideal = members.reduce((sum, item) => sum + item.expected, 0);
      const memberRegions = new Set(members.map((item) => item.region));
      if (dm.stores !== members.length || dm.completed !== done || dm.expected !== ideal
        || dm.pending !== ideal - done || dm.notApplicable !== members.length * names.size - ideal
        || dm.pendingStores !== members.filter((item) => item.completed < item.expected).length
        || !Array.isArray(dm.regions) || dm.regions.length !== memberRegions.size
        || new Set(dm.regions).size !== memberRegions.size || !dm.regions.every((region) => memberRegions.has(region))
        || !percentage(dm.compliance, done, ideal)
        || (index > 0 && data.dms[index - 1].compliance < dm.compliance)) reject("Totales o avance DM inconsistentes.");
    }
    for (const activity of data.activities) {
      const done = data.stores.filter((item) => item.activities[activity.name]).length;
      const ideal = data.stores.filter((item) => item.applicableActivities[activity.name]).length;
      if (activity.completedStores !== done || activity.applicableStores !== ideal
        || activity.pendingStores !== ideal - done || activity.notApplicableStores !== stores.size - ideal
        || !percentage(activity.compliance, done, ideal)) reject("Totales por actividad inconsistentes.");
    }

    const numericActivities = new Set();
    for (const module of data.quantityModules) {
      if (!names.has(module.activity) || numericActivities.has(module.activity)
        || !Array.isArray(module.metrics) || !module.metrics.length) reject("Módulo numérico inválido.");
      numericActivities.add(module.activity);
      const metricKeys = new Set();
      for (const metric of module.metrics) {
        if (!text(metric.key) || metricKeys.has(metric.key) || metric.key === "total" || metric.key === "percentage"
          || !Number.isInteger(metric.minimum) || !Number.isInteger(metric.maximum)
          || metric.minimum < 0 || metric.maximum < metric.minimum) reject("Rango numérico inválido.");
        metricKeys.add(metric.key);
      }
      if (module.percentageMetric && !metricKeys.has(module.percentageMetric)) reject("Métrica porcentual inválida.");
      const records = data.submissions.filter((item) => item.valid && item.activity === module.activity);
      for (const record of records) {
        if (!record.quantities) reject("Respuesta numérica incompleta.");
        const allowedKeys = new Set([...metricKeys, "total", ...(module.percentageMetric ? ["percentage"] : [])]);
        if (Object.keys(record.quantities).some((key) => !allowedKeys.has(key))) reject("Cantidad sin métrica configurada.");
        for (const metric of module.metrics) {
          const value = record.quantities[metric.key];
          if (!Number.isInteger(value) || value < metric.minimum || value > metric.maximum) reject("Cantidad fuera de rango.");
        }
        const total = module.metrics.reduce((sum, metric) => sum + record.quantities[metric.key], 0);
        if (record.quantities.total !== total || (module.percentageMetric && (total
          ? !percentage(record.quantities.percentage, record.quantities[module.percentageMetric], total)
          : record.quantities.percentage !== null))) reject("Total o porcentaje de respuesta inconsistente.");
      }
      const validateTotals = (group, members) => {
        if (group.answeredStores !== members.length || !group.totals) reject("Total numérico incompleto.");
        let total = 0;
        for (const metric of module.metrics) {
          const count = members.reduce((sum, item) => sum + item.quantities[metric.key], 0);
          if (group.totals[metric.key] !== count) reject("Total de piezas inconsistente.");
          total += count;
        }
        if (group.totals.total !== total) reject("Total numérico inconsistente.");
        if (module.percentageMetric && (total
          ? !percentage(group.totals.percentage, group.totals[module.percentageMetric], total)
          : group.totals.percentage !== null)) reject("Porcentaje numérico inconsistente.");
      };
      validateTotals(module, records);
      for (const [key, fields] of [["byRegion", ["region"]], ["byPortfolio", ["region", "dm"]]]) {
        const groups = new Map();
        const groupKey = (item) => JSON.stringify(fields.map((field) => item[field]));
        for (const record of records) {
          const id = groupKey(record);
          if (!groups.has(id)) groups.set(id, []);
          groups.get(id).push(record);
        }
        if (!Array.isArray(module[key]) || module[key].length !== groups.size) reject("Desglose numérico incompleto.");
        for (const group of module[key]) {
          const id = groupKey(group), members = groups.get(id);
          if (!members) reject("Desglose numérico duplicado o ajeno.");
          validateTotals(group, members); groups.delete(id);
        }
      }
    }
    if (data.submissions.some((item) => item.quantities && !numericActivities.has(item.activity))) reject("Respuesta numérica sin módulo.");
    return data;
  }
  scope.OPSDashboard = Object.freeze({ validate });
})(globalThis);
