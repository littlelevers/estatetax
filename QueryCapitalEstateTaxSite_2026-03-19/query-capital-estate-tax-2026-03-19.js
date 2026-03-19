const GOVERNMENT_SOURCES = {
  Connecticut: {
    label: "Connecticut DRS estate and gift tax information",
    url: "https://portal.ct.gov/drs/individuals/individual-income-tax-portal/estate-and-gift-taxes/tax-information",
  },
  "District of Columbia": {
    label: "District of Columbia estate tax return guidance",
    url: "https://otr.cfo.dc.gov/service/estate-tax-return",
  },
  Washington: {
    label: "Washington Department of Revenue estate tax tables",
    url: "https://dor.wa.gov/taxes-rates/other-taxes/estate-tax-tables",
  },
  Vermont: {
    label: "Vermont estate tax statute",
    url: "https://legislature.vermont.gov/statutes/section/32/190/07442a",
  },
  "Rhode Island": {
    label: "Rhode Island estate tax updates advisory",
    url: "https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-12/ADV_2025_27_Estate_Updates.pdf",
  },
  Oregon: {
    label: "Oregon estate transfer tax guidance",
    url: "https://www.oregon.gov/dor/programs/businesses/Pages/estate.aspx",
  },
  "New York": {
    label: "New York estate tax forms and instructions",
    url: "https://www.tax.ny.gov/forms/prvforms/estate_by_type.htm",
  },
  Minnesota: {
    label: "Minnesota estate tax calculators",
    url: "https://www.revenue.state.mn.us/estate-tax-calculators",
  },
  Maryland: {
    label: "Maryland estate tax guidance",
    url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/tips/personal/tip42.pdf",
  },
  Massachusetts: {
    label: "Massachusetts estate tax guide",
    url: "https://www.mass.gov/info-details/massachusetts-estate-tax-guide",
  },
  Maine: {
    label: "Maine estate tax forms and guidance",
    url: "https://www.maine.gov/revenue/taxes/income-estate-tax/estate-tax-706me",
  },
  Illinois: {
    label: "Illinois Attorney General estate tax information",
    url: "https://illinoisattorneygeneral.gov/estate-taxes/",
  },
  Hawaii: {
    label: "Hawaii estate and transfer tax forms",
    url: "https://tax.hawaii.gov/forms/a1_b3_4estate/",
  },
};

const stateSelect = document.querySelector("#state");
const estateValueInput = document.querySelector("#estate-value");
const form = document.querySelector("#calculator-form");

const stateTaxDue = document.querySelector("#state-tax-due");
const stateTaxRate = document.querySelector("#state-tax-rate");
const federalTaxableEstate = document.querySelector("#federal-taxable-estate");
const federalTaxDue = document.querySelector("#federal-tax-due");
const federalTaxRate = document.querySelector("#federal-tax-rate");
const totalTaxDue = document.querySelector("#total-tax-due");
const effectiveTaxRate = document.querySelector("#effective-tax-rate");

const stateOverviewTitle = document.querySelector("#state-overview-title");
const stateOverview = document.querySelector("#state-overview");
const stateNotesTitle = document.querySelector("#state-notes-title");
const stateNotes = document.querySelector("#state-notes");
const governmentSourceTitle = document.querySelector("#government-source-title");
const governmentSource = document.querySelector("#government-source");
const calculationDetails = document.querySelector("#calculation-details");

let taxData;

initialize();

async function initialize() {
  const response = await fetch("./data/query-capital-estate-tax-2026-03-19.json");
  taxData = await response.json();

  populateStates(taxData.states);
  render();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });

  stateSelect.addEventListener("change", render);
  estateValueInput.addEventListener("input", handleEstateInput);
  estateValueInput.addEventListener("focus", handleEstateFocus);
  estateValueInput.addEventListener("blur", handleEstateBlur);
}

function populateStates(states) {
  stateSelect.innerHTML = [
    '<option value="">Select a state</option>',
    ...states.map(
      (entry) => `<option value="${escapeHtml(entry.state)}">${escapeHtml(entry.state)}</option>`
    ),
  ].join("");
}

function handleEstateInput(event) {
  const cleaned = sanitizeNumericText(event.target.value);
  event.target.value = cleaned ? formatWholeNumberText(cleaned) : "";
  render();
}

function handleEstateFocus(event) {
  event.target.value = event.target.value.replace(/,/g, "");
}

function handleEstateBlur(event) {
  formatNumberInput(event.target);
  render();
}

function render() {
  const stateName = stateSelect.value.trim();
  const estateValue = parseInputNumber(estateValueInput.value);
  const hasEstateValue = Number.isFinite(estateValue) && estateValue >= 0;
  const stateEntry = taxData.states.find((entry) => entry.state === stateName);

  updateMetaTitles(stateName);

  let stateResult;
  if (!stateName) {
    stateResult = {
      taxDue: 0,
      rate: 0,
      reason: "no-state",
      status: "Select a state to calculate state tax.",
    };
  } else if (!hasEstateValue) {
    stateResult = {
      taxDue: 0,
      rate: 0,
      reason: "invalid-input",
      status: "Enter a valid estate value.",
    };
  } else {
    stateResult = calculateForSheet(stateName, estateValue);
    if (stateResult.reason === "missing-sheet") {
      stateResult.status = "No state estate tax table exists for this state, so state tax is treated as $0.";
    }
  }

  const derivedFederalTaxableEstate = hasEstateValue
    ? Math.max(estateValue - stateResult.taxDue, 0)
    : 0;

  const federalResult = hasEstateValue
    ? calculateForSheet("Federal", derivedFederalTaxableEstate)
    : {
        taxDue: 0,
        rate: 0,
        reason: "invalid-input",
        status: "Federal tax is calculated after you enter an estate value.",
      };

  setResults({
    state: stateResult,
    federalTaxableEstateValue: derivedFederalTaxableEstate,
    federal: federalResult,
    estateValue: hasEstateValue ? estateValue : 0,
    overview: buildOverviewText(stateEntry),
    notes: buildNotesText(stateEntry),
    governmentSourceHtml: buildGovernmentSourceHtml(stateName, stateResult),
  });
}

function calculateForSheet(sheetName, inputValue) {
  const table = taxData.tables[sheetName];
  if (!table) {
    return {
      taxDue: 0,
      rate: 0,
      reason: "missing-sheet",
      status: `${sheetName} table not found.`,
    };
  }

  const effectiveValue = table.cliff != null && inputValue <= table.cliff ? 0 : inputValue;
  const bracket = pickBracket(table.brackets, effectiveValue);

  if (!bracket) {
    return {
      taxDue: 0,
      rate: 0,
      reason: "missing-bracket",
      status: `No bracket found for ${sheetName}.`,
    };
  }

  return {
    taxDue: (effectiveValue - bracket.threshold) * bracket.rate + bracket.baseTax,
    rate: bracket.rate,
    reason: table.cliff != null && inputValue <= table.cliff ? "cliff-zeroed" : "calculated",
    status:
      table.cliff != null && inputValue <= table.cliff
        ? `${sheetName} has a cliff at ${formatCurrency(table.cliff)}. The table treats this amount as $0.`
        : `Using the ${formatCurrency(bracket.threshold)} bracket from ${sheetName}.`,
  };
}

function pickBracket(brackets, inputValue) {
  let bestMatch = null;

  for (const bracket of brackets) {
    if (!Number.isFinite(bracket.threshold) || !Number.isFinite(bracket.rate)) {
      continue;
    }

    if (inputValue < bracket.threshold) {
      continue;
    }

    let exactBand = !Number.isFinite(bracket.limit) || inputValue < bracket.limit;
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

function setResults({
  state,
  federalTaxableEstateValue,
  federal,
  estateValue,
  overview,
  notes,
  governmentSourceHtml,
}) {
  const total = state.taxDue + federal.taxDue;
  const effectiveRate = estateValue > 0 ? total / estateValue : 0;

  stateTaxDue.textContent = formatCurrency(state.taxDue);
  stateTaxRate.textContent = formatPercent(state.rate);
  federalTaxableEstate.textContent = formatCurrency(federalTaxableEstateValue);
  federalTaxDue.textContent = formatCurrency(federal.taxDue);
  federalTaxRate.textContent = formatPercent(federal.rate);
  totalTaxDue.textContent = formatCurrency(total);
  effectiveTaxRate.textContent = formatPercent(effectiveRate);

  stateOverview.textContent = overview;
  stateNotes.textContent = notes;
  governmentSource.innerHTML = governmentSourceHtml;
  calculationDetails.textContent = [
    state.status,
    "Federal taxable estate is calculated as estate value minus state tax due.",
    federal.status,
  ]
    .filter(Boolean)
    .join(" ");
}

function updateMetaTitles(stateName) {
  stateOverviewTitle.textContent = titleForState(stateName, "State Overview");
  stateNotesTitle.textContent = titleForState(stateName, "State Notes");
  governmentSourceTitle.textContent = titleForState(stateName, "Government Source");
}

function titleForState(stateName, suffix) {
  return stateName ? `${stateName} ${suffix}` : suffix;
}

function buildOverviewText(stateEntry) {
  if (!stateEntry) {
    return "Select a state to see its overview values.";
  }

  return [
    `Estate tax exemption: ${formatRawValue(stateEntry.estateTaxExemption)}.`,
    `Estate tax rate: ${stateEntry.estateTaxRate || "0"}.`,
    `Inheritance tax exemption: ${formatRawValue(stateEntry.inheritanceTaxExemption)}.`,
    `Inheritance tax rate: ${stateEntry.inheritanceTaxRate || "0"}.`,
  ].join(" ");
}

function buildNotesText(stateEntry) {
  if (!stateEntry) {
    return "Select a state to see workbook notes.";
  }

  return stateEntry.notes || "No additional notes available for this state.";
}

function buildGovernmentSourceHtml(stateName, stateResult) {
  if (!stateName) {
    return "Select a state to view an official source for the state tax table.";
  }

  const source = GOVERNMENT_SOURCES[stateName];
  if (source) {
    return `<a class="source-link" href="${source.url}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`;
  }

  if (stateResult.reason === "missing-sheet") {
    return "No state estate tax table is used for this state.";
  }

  return "No official source is linked for this state yet.";
}

function sanitizeNumericText(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseInputNumber(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text) {
    return NaN;
  }
  return Number(text);
}

function formatNumberInput(input) {
  const parsed = parseInputNumber(input.value);
  input.value = Number.isFinite(parsed)
    ? formatWholeNumberText(String(Math.trunc(parsed)))
    : "";
}

function formatWholeNumberText(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value));
}

function formatRawValue(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return formatCurrency(numeric);
  }
  return String(value || "n/a");
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
