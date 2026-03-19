const stateSelect = document.querySelector("#state");
const stateEstateInput = document.querySelector("#state-estate");
const federalEstateInput = document.querySelector("#federal-estate");
const form = document.querySelector("#calculator-form");

const stateTaxDue = document.querySelector("#state-tax-due");
const stateTaxRate = document.querySelector("#state-tax-rate");
const federalTaxDue = document.querySelector("#federal-tax-due");
const federalTaxRate = document.querySelector("#federal-tax-rate");
const totalTaxDue = document.querySelector("#total-tax-due");
const effectiveTaxRate = document.querySelector("#effective-tax-rate");
const stateOverview = document.querySelector("#state-overview");
const stateNotes = document.querySelector("#state-notes");
const calculationDetails = document.querySelector("#calculation-details");
const dataSource = document.querySelector("#data-source");

let taxData;

initialize();

async function initialize() {
  const response = await fetch("./data/tax-data.json");
  taxData = await response.json();

  populateStates(taxData.states);
  stateSelect.value = "New York";
  stateEstateInput.value = "8000000";
  federalEstateInput.value = "7226800";
  dataSource.textContent = `Embedded from ${taxData.generatedFrom}.`;
  render();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });

  stateSelect.addEventListener("change", render);
  stateEstateInput.addEventListener("change", render);
  federalEstateInput.addEventListener("change", render);
}

function populateStates(states) {
  stateSelect.innerHTML = states
    .map(
      (entry) => `<option value="${escapeHtml(entry.state)}">${escapeHtml(entry.state)}</option>`
    )
    .join("");
}

function render() {
  const stateName = stateSelect.value;
  const stateEstate = Number(stateEstateInput.value);
  const federalEstate = Number(federalEstateInput.value);
  const stateEntry = taxData.states.find((entry) => entry.state === stateName);

  const invalidStateEstate = !Number.isFinite(stateEstate) || stateEstate < 0;
  const invalidFederalEstate = !Number.isFinite(federalEstate) || federalEstate < 0;

  const stateResult = invalidStateEstate
    ? { taxDue: 0, rate: 0, reason: "invalid-input", status: "Enter a valid state estate value." }
    : calculateForSheet(stateName, stateEstate);
  const federalResult = invalidFederalEstate
    ? {
        taxDue: 0,
        rate: 0,
        reason: "invalid-input",
        status: "Enter a valid federal taxable estate.",
      }
    : calculateForSheet("Federal", federalEstate);

  let status = stateResult.status;
  if (stateResult.reason === "missing-sheet") {
    status = "No state estate tax table exists for this state, so state tax is treated as 0.";
  }

  setResults({
    state: { ...stateResult, status },
    federal: federalResult,
    stateEstate,
    notes: stateEntry?.notes || "No state notes available.",
    overview: buildOverviewText(stateEntry),
  });
}

function calculateForSheet(sheetName, estate) {
  const table = taxData.tables[sheetName];
  if (!table) {
    return {
      taxDue: 0,
      rate: 0,
      reason: "missing-sheet",
      status: `${sheetName} table not found.`,
    };
  }

  const effectiveEstate = table.cliff != null && estate <= table.cliff ? 0 : estate;
  const bracket = pickBracket(table.brackets, effectiveEstate);

  if (!bracket) {
    return {
      taxDue: 0,
      rate: 0,
      reason: "missing-bracket",
      status: `No bracket found for ${sheetName}.`,
    };
  }

  return {
    taxDue: (effectiveEstate - bracket.threshold) * bracket.rate + bracket.baseTax,
    rate: bracket.rate,
    reason: table.cliff != null && estate <= table.cliff ? "cliff-zeroed" : "calculated",
    status:
      table.cliff != null && estate <= table.cliff
        ? `${sheetName} has a cliff at ${formatCurrency(table.cliff)}. Estate is treated as 0 for that table.`
        : `Using the ${formatCurrency(bracket.threshold)} bracket from ${sheetName}.`,
  };
}

function pickBracket(brackets, estate) {
  let bestMatch = null;

  for (const bracket of brackets) {
    if (!Number.isFinite(bracket.threshold) || !Number.isFinite(bracket.rate)) {
      continue;
    }

    if (estate < bracket.threshold) {
      continue;
    }

    let exactBand = !Number.isFinite(bracket.limit) || estate < bracket.limit;
    if (!exactBand && Number.isFinite(bracket.limit) && bracket.limit <= bracket.threshold) {
      exactBand = true;
    }

    if (!bestMatch) {
      bestMatch = { ...bracket, exactBand };
      continue;
    }

    if (exactBand && !bestMatch.exactBand) {
      bestMatch = { ...bracket, exactBand };
      continue;
    }

    if (bracket.threshold > bestMatch.threshold) {
      bestMatch = { ...bracket, exactBand };
    }
  }

  return bestMatch;
}

function setResults({ state, federal, stateEstate, notes, overview }) {
  const total = state.taxDue + federal.taxDue;
  const effectiveRate = stateEstate > 0 ? total / stateEstate : 0;

  stateTaxDue.textContent = formatCurrency(state.taxDue);
  stateTaxRate.textContent = formatPercent(state.rate);
  federalTaxDue.textContent = formatCurrency(federal.taxDue);
  federalTaxRate.textContent = formatPercent(federal.rate);
  totalTaxDue.textContent = formatCurrency(total);
  effectiveTaxRate.textContent = formatPercent(effectiveRate);
  stateOverview.textContent = overview;
  stateNotes.textContent = notes;
  calculationDetails.textContent = [state.status, federal.status].filter(Boolean).join(" ");
}

function buildOverviewText(stateEntry) {
  if (!stateEntry) {
    return "No overview row found for this state.";
  }

  const estateTaxExemption = stateEntry.estateTaxExemption || "n/a";
  const estateTaxRate = stateEntry.estateTaxRate || "0";
  const inheritanceTaxExemption = stateEntry.inheritanceTaxExemption || "n/a";
  const inheritanceTaxRate = stateEntry.inheritanceTaxRate || "0";

  return [
    `Estate tax exemption: ${formatRawValue(estateTaxExemption)}.`,
    `Estate tax rate: ${estateTaxRate}.`,
    `Inheritance tax exemption: ${formatRawValue(inheritanceTaxExemption)}.`,
    `Inheritance tax rate: ${inheritanceTaxRate}.`,
  ].join(" ");
}

function formatRawValue(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return formatCurrency(numeric);
  }
  return String(value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
