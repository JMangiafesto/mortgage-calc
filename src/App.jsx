import { useMemo, useState } from 'react'
import './App.css'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})
// format number as currency with commas and 2 decimal places, or return '—' if not a finite number
const parseNumber = (value) => {
  if (value === '' || value === null || value === undefined) return Number.NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const paymentFromRate = (principal, monthlyRate, months) => {
  if (months <= 0 || !Number.isFinite(principal)) return Number.NaN
  if (monthlyRate === 0) return principal / months
  return (
    (principal * monthlyRate) /
    (1 - Math.pow(1 + monthlyRate, -months))
  )
}

const principalFromPayment = (payment, monthlyRate, months) => {
  if (!Number.isFinite(payment) || months <= 0) return Number.NaN
  if (monthlyRate === 0) return payment * months
  return (payment * (1 - Math.pow(1 + monthlyRate, -months))) / monthlyRate
}

const solveRate = (principal, months, payment) => {
  if (!Number.isFinite(principal) || !Number.isFinite(months) || !Number.isFinite(payment)) {
    return Number.NaN
  }
  if (payment <= 0 || principal <= 0 || months <= 0) return Number.NaN

  let low = 0
  let high = 0.5
  let paymentAtHigh = paymentFromRate(principal, high, months)
  let guard = 0
  while (paymentAtHigh < payment && guard < 20) {
    high *= 2
    paymentAtHigh = paymentFromRate(principal, high, months)
    guard += 1
  }
  if (!Number.isFinite(paymentAtHigh)) return Number.NaN

  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2
    const paymentAtMid = paymentFromRate(principal, mid, months)
    if (paymentAtMid > payment) {
      high = mid
    } else {
      low = mid
    }
  }

  return (low + high) / 2
}

const annuityFutureValue = (payment, months, monthlyRate) => {
  if (!Number.isFinite(payment) || months <= 0) return 0
  if (monthlyRate === 0) return payment * months
  return payment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate)
}

const solveBreakEvenNetAtMonth = ({
  months,
  initialDelta,
  optionBPayment,
  optionBMonths,
  closingToA,
  closingToB,
  interestSaved,
  lowerInterestIndex,
}) => {
  if (!Number.isFinite(interestSaved) || interestSaved <= 0) return Number.NaN
  if (!Number.isFinite(initialDelta)) return Number.NaN

  const contributionsAMonths = months
  const contributionsBMonths = Math.max(0, months - optionBMonths)

  const netDiffAt = (monthlyRate) => {
    const growthFactor = Math.pow(1 + monthlyRate, months)
    const valueA = annuityFutureValue(initialDelta, contributionsAMonths, monthlyRate) + closingToA * growthFactor
    const valueB = annuityFutureValue(optionBPayment, contributionsBMonths, monthlyRate) + closingToB * growthFactor
    const gainA = valueA - (initialDelta * contributionsAMonths + closingToA)
    const gainB = valueB - (optionBPayment * contributionsBMonths + closingToB)
    const netA = gainA + (lowerInterestIndex === 0 ? interestSaved : 0)
    const netB = gainB + (lowerInterestIndex === 1 ? interestSaved : 0)
    return netA - netB
  }

  let low = 0
  let high = 0.5
  let guard = 0

  let diffLow = netDiffAt(low)
  if (!Number.isFinite(diffLow)) return Number.NaN
  if (Math.abs(diffLow) < 1e-6) return 0

  let diffHigh = netDiffAt(high)
  if (diffLow < 0) {
    while (Number.isFinite(diffHigh) && diffHigh < 0 && guard < 30) {
      high *= 2
      diffHigh = netDiffAt(high)
      guard += 1
    }
  } else {
    while (Number.isFinite(diffHigh) && diffHigh > 0 && guard < 30) {
      high *= 2
      diffHigh = netDiffAt(high)
      guard += 1
    }
  }

  if (!Number.isFinite(diffHigh) || diffLow * diffHigh > 0) return Number.NaN

  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2
    const diffMid = netDiffAt(mid)
    if (!Number.isFinite(diffMid)) return Number.NaN
    if (diffLow * diffMid <= 0) {
      high = mid
      diffHigh = diffMid
    } else {
      low = mid
      diffLow = diffMid
    }
  }

  const monthlyRate = (low + high) / 2
  return (Math.pow(1 + monthlyRate, 12) - 1) * 100
}

const solveBreakEvenNetRate = (optionA, optionB) => {
  if (!optionA || !optionB) return Number.NaN
  const interestA = optionA.totals.totalInterest
  const interestB = optionB.totals.totalInterest
  const lowerInterestIndex = interestA === interestB ? null : interestA < interestB ? 0 : 1

  const netDiffAt = (annualRate) => {
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1
    const schedule = buildSchedule(optionA, optionB, monthlyRate)
    const end = schedule?.meta?.end
    if (!end) return Number.NaN

    const interestSaved = end.interestDeltaSum
    const netOption1 = end.portfolioValue + (lowerInterestIndex === 0 ? interestSaved : 0)
    const netOption2 = end.portfolioValueAlt + (lowerInterestIndex === 1 ? interestSaved : 0)
    return netOption1 - netOption2
  }

  let low = 0
  let high = 1
  let guard = 0

  let diffLow = netDiffAt(low)
  if (!Number.isFinite(diffLow)) return Number.NaN
  if (Math.abs(diffLow) < 1e-6) return 0

  let diffHigh = netDiffAt(high)
  if (diffLow < 0) {
    while (Number.isFinite(diffHigh) && diffHigh < 0 && guard < 12) {
      high *= 2
      diffHigh = netDiffAt(high)
      guard += 1
    }
  } else {
    while (Number.isFinite(diffHigh) && diffHigh > 0 && guard < 12) {
      high *= 2
      diffHigh = netDiffAt(high)
      guard += 1
    }
  }

  if (!Number.isFinite(diffHigh) || diffLow * diffHigh > 0) return Number.NaN

  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2
    const diffMid = netDiffAt(mid)
    if (!Number.isFinite(diffMid)) return Number.NaN
    if (diffLow * diffMid <= 0) {
      high = mid
      diffHigh = diffMid
    } else {
      low = mid
      diffLow = diffMid
    }
  }

  return high * 100
}

const calculateMortgageBreakeven = (results, options, returnRate, taxRate = 0.15) => {
  if (!results[0] || !results[1] || results[0].error || results[1].error) return null;
  
  const opt1 = results[0];
  const opt2 = results[1];
  
  const principal1 = opt1.computed.principal;
  const principal2 = opt2.computed.principal;
  const mRate1 = opt1.computed.rate / 100 / 12;
  const mRate2 = opt2.computed.rate / 100 / 12;
  const mReturn = parseFloat(returnRate) / 100 / 12;
  
  if (!Number.isFinite(mReturn)) return null;

  // Base monthly payments (P&I only)
  const basePay1 = opt1.computed.payment;
  const basePay2 = opt2.computed.payment;
  
  // PMI setup
  const pmi1 = parseNumber(options[0].pmi);
  const pmi2 = parseNumber(options[1].pmi);
  const pmiThreshold1 = principal1 * 0.78;
  const pmiThreshold2 = principal2 * 0.78;
  
  // Closing costs
  const closingCost1 = parseNumber(options[0].closingCosts);
  const closingCost2 = parseNumber(options[1].closingCosts);
  const closingCost1Value = Number.isFinite(closingCost1) ? closingCost1 : 0;
  const closingCost2Value = Number.isFinite(closingCost2) ? closingCost2 : 0;
  
  // Use the same logic as buildSchedule
  const paymentA = opt1.computed.payment;
  const paymentB = opt2.computed.payment;
  const higherIndex = paymentA === paymentB ? null : paymentA > paymentB ? 0 : 1;
  const closingCostA = closingCost1Value;
  const closingCostB = closingCost2Value;
  const principalDelta = principal2 - principal1;
  const downToPortfolioA = principalDelta < 0 ? Math.abs(principalDelta) : 0;
  const downToPortfolioB = principalDelta > 0 ? principalDelta : 0;
  const closingToPortfolioA = (Number.isFinite(closingCostB) ? closingCostB : 0) + downToPortfolioA;
  const closingToPortfolioB = (Number.isFinite(closingCostA) ? closingCostA : 0) + downToPortfolioB;
  const initialDelta = Math.abs(paymentA - paymentB);

  let balance1 = principal1;
  let balance2 = principal2;
  let portfolioValue = closingToPortfolioA;
  let portfolioValueAlt = closingToPortfolioB;
  let portfolioContributionSum = closingToPortfolioA;
  let portfolioAltContributionSum = closingToPortfolioB;
  
  const months1 = opt1.computed.months;
  const months2 = opt2.computed.months;
  const maxMonths = Math.max(months1, months2);
  
  let prevDiff = null;
  
  for (let month = 1; month <= maxMonths; month++) {
    const active1 = month <= months1;
    const active2 = month <= months2;
    
    // Check PMI status
    const pmiActive1 = active1 && Number.isFinite(pmi1) && balance1 > pmiThreshold1;
    const pmiActive2 = active2 && Number.isFinite(pmi2) && balance2 > pmiThreshold2;
    
    const pmiPaid1 = pmiActive1 ? pmi1 : 0;
    const pmiPaid2 = pmiActive2 ? pmi2 : 0;
    
    const scheduledPayment1 = active1 ? basePay1 + pmiPaid1 : 0;
    const scheduledPayment2 = active2 ? basePay2 + pmiPaid2 : 0;
    
    // Reduce Balances (Amortization)
    if (active1) {
      const interest1 = balance1 * mRate1;
      const principalPayment1 = Math.min(Math.max(basePay1 - interest1, 0), balance1);
      balance1 = Math.max(balance1 - principalPayment1, 0);
    }
    
    if (active2) {
      const interest2 = balance2 * mRate2;
      const principalPayment2 = Math.min(Math.max(basePay2 - interest2, 0), balance2);
      balance2 = Math.max(balance2 - principalPayment2, 0);
    }
    
    // Calculate portfolio contributions (same as buildSchedule)
    const contributionPrimary = Number.isFinite(initialDelta) ? initialDelta : 0;
    const contributionAlt = !active2 && Number.isFinite(basePay2) && basePay2 > 0 ? basePay2 : 0;
    
    // Grow portfolios
    portfolioValue = portfolioValue * (1 + mReturn) + contributionPrimary;
    portfolioValueAlt = portfolioValueAlt * (1 + mReturn) + contributionAlt;
    portfolioContributionSum += contributionPrimary;
    portfolioAltContributionSum += contributionAlt;
    
    // Calculate net value difference using same logic as monthly table
    const portfolioGain1 = portfolioValue - portfolioContributionSum;
    const portfolioGain2 = portfolioValueAlt - portfolioAltContributionSum;
    const tax1 = portfolioGain1 > 0 ? portfolioGain1 * taxRate : 0;
    const tax2 = portfolioGain2 > 0 ? portfolioGain2 * taxRate : 0;
    const afterTax1 = portfolioValue - tax1;
    const afterTax2 = portfolioValueAlt - tax2;
    const equity1 = principal1 - balance1;
    const equity2 = principal2 - balance2;
    const diff = (afterTax1 + equity1) - (afterTax2 + equity2);
    
    // Check for crossover
    if (prevDiff !== null) {
      // If sign changed, we found the crossover
      if ((prevDiff < 0 && diff > 0) || (prevDiff > 0 && diff < 0)) {
        return month;
      }
    }
    
    prevDiff = diff;
  }
  
  return null;
};


const buildSchedule = (optionA, optionB, monthlyReturnRate) => {
  if (!optionA || !optionB) return { rows: [], meta: null }
  const months = Math.max(optionA.computed.months, optionB.computed.months)

  const paymentA = optionA.computed.payment
  const paymentB = optionB.computed.payment
  const higherIndex = paymentA === paymentB ? null : paymentA > paymentB ? 0 : 1
  const lowerIndex = higherIndex === null ? null : higherIndex === 0 ? 1 : 0
  const initialPaymentB = paymentB
  const closingCostA = parseNumber(optionA.closingCosts)
  const closingCostB = parseNumber(optionB.closingCosts)
  const principalDelta = optionB.computed.principal - optionA.computed.principal
  const downToPortfolioA = principalDelta < 0 ? Math.abs(principalDelta) : 0
  const downToPortfolioB = principalDelta > 0 ? principalDelta : 0
  const pmiA = parseNumber(optionA.pmi)
  const pmiB = parseNumber(optionB.pmi)
  const pmiThresholdA = optionA.computed.principal * 0.78
  const pmiThresholdB = optionB.computed.principal * 0.78
  const closingToPortfolioA =
    (Number.isFinite(closingCostB) ? closingCostB : 0) + downToPortfolioA
  const closingToPortfolioB =
    (Number.isFinite(closingCostA) ? closingCostA : 0) + downToPortfolioB
  const initialDelta = Math.abs(paymentA - paymentB)
  const totalInterestA = optionA.totals.totalInterest
  const totalInterestB = optionB.totals.totalInterest
  const lowerInterestIndex = totalInterestA === totalInterestB ? null : totalInterestA < totalInterestB ? 0 : 1
  const higherInterestIndex = lowerInterestIndex === null ? null : lowerInterestIndex === 0 ? 1 : 0

  let balanceA = optionA.computed.principal
  let balanceB = optionB.computed.principal
  const monthlyRateA = optionA.computed.rate / 100 / 12
  const monthlyRateB = optionB.computed.rate / 100 / 12

  let deltaSum = 0
  let interestDeltaSum = 0
  let pmiMonthsA = 0
  let pmiMonthsB = 0
  let pmiEndMonthA = null
  let pmiEndMonthB = null
  let portfolioValue = Number.isFinite(monthlyReturnRate) ? closingToPortfolioA : Number.NaN
  let portfolioValueAlt = Number.isFinite(monthlyReturnRate) ? closingToPortfolioB : Number.NaN
  let portfolioContributionSum = closingToPortfolioA
  let portfolioAltContributionSum = closingToPortfolioB

  const rows = []

  for (let month = 1; month <= months; month += 1) {
    const activeA = month <= optionA.computed.months
    const activeB = month <= optionB.computed.months

    const pmiActiveA = Number.isFinite(pmiA) && balanceA > pmiThresholdA
    const pmiActiveB = Number.isFinite(pmiB) && balanceB > pmiThresholdB
    if (pmiActiveA) {
      pmiMonthsA += 1
      pmiEndMonthA = month
    }
    if (pmiActiveB) {
      pmiMonthsB += 1
      pmiEndMonthB = month
    }
    const interestPaidA = activeA ? balanceA * monthlyRateA : 0
    const interestPaidB = activeB ? balanceB * monthlyRateB : 0
    const pmiPaidA = activeA && pmiActiveA ? pmiA : 0
    const pmiPaidB = activeB && pmiActiveB ? pmiB : 0
    const interestWithPmiA = interestPaidA + pmiPaidA
    const interestWithPmiB = interestPaidB + pmiPaidB

    const scheduledPaymentA = activeA ? optionA.computed.payment + pmiPaidA : 0
    const scheduledPaymentB = activeB ? optionB.computed.payment + pmiPaidB : 0

    const principalPaidA = activeA
      ? Math.min(Math.max(optionA.computed.payment - interestPaidA, 0), balanceA)
      : 0
    const principalPaidB = activeB
      ? Math.min(Math.max(optionB.computed.payment - interestPaidB, 0), balanceB)
      : 0

    balanceA = activeA ? Math.max(balanceA - principalPaidA, 0) : 0
    balanceB = activeB ? Math.max(balanceB - principalPaidB, 0) : 0

    const savingsDelta = scheduledPaymentB - scheduledPaymentA
    deltaSum += savingsDelta
    if (higherInterestIndex === 0) {
      interestDeltaSum += interestWithPmiA - interestWithPmiB
    } else if (higherInterestIndex === 1) {
      interestDeltaSum += interestWithPmiB - interestWithPmiA
    }

    const contributionPrimary = Number.isFinite(initialDelta) ? initialDelta : 0
    const contributionAlt =
      !activeB && Number.isFinite(initialPaymentB) && initialPaymentB > 0
        ? initialPaymentB
        : 0

    if (Number.isFinite(monthlyReturnRate)) {
      // Annuity Due formula with contributions at the beginning of the month: FV = P * [((1 + r)^n - 1) / r] * (1 + r)
      // portfolioValue = (portfolioValue + contributionPrimary) * (1 + monthlyReturnRate)
      // portfolioValueAlt = (portfolioValueAlt + contributionAlt) * (1 + monthlyReturnRate)
      // Ordinary Annuity formula with contributions at the end of the month: FV = P * [((1 + r)^n - 1) / r]
      portfolioValue = portfolioValue * (1 + monthlyReturnRate) + contributionPrimary
      portfolioValueAlt = portfolioValueAlt * (1 + monthlyReturnRate) + contributionAlt
      portfolioContributionSum += contributionPrimary
      portfolioAltContributionSum += contributionAlt
    } else {
      portfolioValue = Number.NaN
      portfolioValueAlt = Number.NaN
    }

    const breakEvenRate = solveBreakEvenNetAtMonth({
      months: month,
      initialDelta,
      optionBPayment: initialPaymentB,
      optionBMonths: optionB.computed.months,
      closingToA: closingToPortfolioA,
      closingToB: closingToPortfolioB,
      interestSaved: interestDeltaSum,
      lowerInterestIndex,
    })

    const breakEvenLabel = interestDeltaSum <= 0
      ? '∞'
      : Number.isFinite(breakEvenRate)
        ? breakEvenRate > 1000
          ? '∞'
          : `${breakEvenRate.toFixed(2)}%`
        : '—'

    rows.push({
      month,
      paymentA: scheduledPaymentA,
      paymentB: scheduledPaymentB,
      principalPaidA,
      principalPaidB,
      interestPaidA,
      interestPaidB,
      balanceA,
      balanceB,
      deltaSum,
      interestDeltaSum,
      portfolioValue,
      portfolioGain: Number.isFinite(portfolioValue)
        ? portfolioValue - portfolioContributionSum
        : Number.NaN,
      portfolioValueAlt,
      portfolioGainAlt: Number.isFinite(portfolioValueAlt)
        ? portfolioAltContributionSum === 0
          ? 0
          : portfolioValueAlt - portfolioAltContributionSum
        : Number.NaN,
      breakEvenRate,
      breakEvenLabel,
    })
  }

  return {
    rows,
    meta: {
      higherIndex,
      lowerIndex,
      pmi: {
        monthsA: pmiMonthsA,
        monthsB: pmiMonthsB,
        endMonthA: pmiEndMonthA,
        endMonthB: pmiEndMonthB,
        totalA: Number.isFinite(pmiA) ? pmiA * pmiMonthsA : Number.NaN,
        totalB: Number.isFinite(pmiB) ? pmiB * pmiMonthsB : Number.NaN,
      },
      end: rows[rows.length - 1],
    },
  }
}

const calculateOption = (option) => {
  const principal = parseNumber(option.principal)
  const years = parseNumber(option.years)
  const rate = parseNumber(option.rate)
  const payment = parseNumber(option.payment)
  const pmi = parseNumber(option.pmi)

  const fieldValues = { principal, years, rate, payment }
  const missingFields = Object.entries(fieldValues)
    .filter(([, value]) => !Number.isFinite(value))
    .map(([key]) => key)

  if (missingFields.length !== 1) {
    return {
      error: 'Leave exactly one of the following fields blank: principal, years, rate, payment.',
      missingField: missingFields[0],
    }
  }

  const missingField = missingFields[0]
  let computedPrincipal = principal
  let computedYears = years
  let computedRate = rate
  let computedPayment = payment

  if (missingField === 'payment') {
    const months = years * 12
    const monthlyRate = rate / 100 / 12
    computedPayment = paymentFromRate(principal, monthlyRate, months)
  }

  if (missingField === 'principal') {
    const months = years * 12
    const monthlyRate = rate / 100 / 12
    computedPrincipal = principalFromPayment(payment, monthlyRate, months)
  }

  if (missingField === 'years') {
    const monthlyRate = rate / 100 / 12
    if (monthlyRate === 0) {
      computedYears = principal / payment / 12
    } else {
      const inner = 1 - (principal * monthlyRate) / payment
      if (inner <= 0) return { error: 'Payment is too low for this loan.', missingField }
      const months = -Math.log(inner) / Math.log(1 + monthlyRate)
      computedYears = months / 12
    }
  }

  if (missingField === 'rate') {
    const months = years * 12
    const monthlyRate = solveRate(principal, months, payment)
    computedRate = monthlyRate * 12 * 100
  }

  const months = computedYears * 12
  const monthlyRate = computedRate / 100 / 12
  const finalPayment = paymentFromRate(computedPrincipal, monthlyRate, months)
  const totalPayment = finalPayment * months
  let pmiEndMonth = Number.NaN
  if (pmi > 0 && Number.isFinite(finalPayment) && Number.isFinite(monthlyRate)) {
    const pmiThreshold = computedPrincipal * 0.78
    let balance = computedPrincipal
    for (let month = 1; month <= months; month += 1) {
      const interest = balance * monthlyRate
      const principalPaid = Math.min(finalPayment - interest, balance)
      balance = Math.max(balance - principalPaid, 0)
      if (balance <= pmiThreshold) {
        pmiEndMonth = month
        break
      }
    }
  }
  const pmiTotal = Number.isFinite(pmiEndMonth) ? pmi * pmiEndMonth : 0
  const totalInterest = totalPayment - computedPrincipal + pmiTotal

  if (![computedPrincipal, computedYears, computedRate, finalPayment, totalPayment].every(Number.isFinite)) {
    return { error: 'Please enter valid numbers.', missingField }
  }

  return {
    missingField,
    computed: {
      principal: computedPrincipal,
      years: computedYears,
      rate: computedRate,
      payment: finalPayment,
      paymentWithPmi: finalPayment + (Number.isFinite(pmi) ? pmi : 0),
      months,
    },
    totals: {
      totalPayment,
      totalInterest,
    },
  }
}

function App() {
  const [options, setOptions] = useState([
    {
      id: 'option-1',
      label: 'Mortgage option 1',
      purchasePrice: 'n/a',
      downPercent: 'n/a',
      principal: '350000',
      years: '30',
      rate: '6',
      payment: '',
      closingCosts: '0',
      pmi: '0',
    },
    {
      id: 'option-2',
      label: 'Mortgage option 2',
      purchasePrice: 'n/a',
      downPercent: 'n/a',
      principal: '350000',
      years: '15',
      rate: '5.5',
      payment: '',
      closingCosts: '0',
      pmi: '0',
    },
  ])
  const [returnRate, setReturnRate] = useState('10')

  const results = useMemo(() => options.map((option) => calculateOption(option)), [options])
  const returnRateValue = parseNumber(returnRate)
  const monthlyReturnRate = Number.isFinite(returnRateValue)
    ? Math.pow(1 + returnRateValue / 100, 1 / 12) - 1
    : Number.NaN

  const bothValid = results.every((result) => !result.error)

  const scheduleData = useMemo(() => {
    if (!bothValid) return { rows: [], meta: null }
    return buildSchedule(
      { ...results[0], closingCosts: options[0].closingCosts, pmi: options[0].pmi },
      { ...results[1], closingCosts: options[1].closingCosts, pmi: options[1].pmi },
      monthlyReturnRate
    )
  }, [bothValid, results, monthlyReturnRate, options])

  const scheduleRows = scheduleData.rows

  const comparisonRows = useMemo(() => {
    if (!bothValid) return []
    const [first, second] = results
    const totalPaymentByOption = scheduleRows.reduce(
      (acc, row) => {
        acc[0] += row.paymentA
        acc[1] += row.paymentB
        return acc
      },
      [0, 0]
    )
    const higherIndex = scheduleData.meta?.higherIndex ?? null
    const lowerIndex = scheduleData.meta?.lowerIndex ?? null
    const higher = higherIndex === null ? null : higherIndex === 0 ? first : second
    const lower = lowerIndex === null ? null : lowerIndex === 0 ? first : second

    const interestA = first.totals.totalInterest
    const interestB = second.totals.totalInterest
    const lowerInterestIndex =
      interestA === interestB ? null : interestA < interestB ? 0 : 1

    const breakEvenRate = solveBreakEvenNetRate(
      { ...first, closingCosts: options[0].closingCosts, pmi: options[0].pmi },
      { ...second, closingCosts: options[1].closingCosts, pmi: options[1].pmi }
    )

    const breakEvenLabel = Number.isFinite(breakEvenRate)
      ? `${breakEvenRate.toFixed(2)}%`
      : '—'

    const pmiMeta = scheduleData.meta?.pmi

    return [first, second].map((result, index) => {
      const deltaSum = scheduleData.meta?.end?.deltaSum
      const interestSaved = index === lowerInterestIndex ? scheduleData.meta?.end?.interestDeltaSum : Number.NaN
      const portfolioValue =
        index === 0 ? scheduleData.meta?.end?.portfolioValue : scheduleData.meta?.end?.portfolioValueAlt
      const portfolioGain =
        index === 0 ? scheduleData.meta?.end?.portfolioGain : scheduleData.meta?.end?.portfolioGainAlt
      const showBreakEven = index === lowerIndex || index === higherIndex
      const pmiAmount = parseNumber(options[index].pmi)
      const pmiEndMonth = index === 0 ? pmiMeta?.endMonthA : pmiMeta?.endMonthB
      const pmiTotal = Number.isFinite(pmiAmount) && pmiEndMonth
        ? pmiAmount * pmiEndMonth
        : Number.NaN
      
      // Calculate 15% capital gains tax
      const taxRate = 0.15
      const taxAmount = Number.isFinite(portfolioGain) && portfolioGain > 0 ? portfolioGain * taxRate : 0
      const afterTaxPortfolioValue = portfolioValue - taxAmount
      const afterTaxPortfolioGain = portfolioGain - taxAmount

      return {
        label: options[index].label,
        payment: result.computed.paymentWithPmi,
        totalPayment: totalPaymentByOption[index],
        totalInterest: result.totals.totalInterest,
        deltaSum,
        interestDelta: interestSaved,
        portfolioValue,
        portfolioGain,
        taxAmount,
        afterTaxPortfolioValue,
        afterTaxPortfolioGain,
        breakEvenRate: showBreakEven ? breakEvenRate : Number.NaN,
        breakEvenLabel: showBreakEven ? breakEvenLabel : '—',
        pmiAmount,
        pmiEndMonth,
        pmiTotal,
      }
    })
  }, [bothValid, results, options, scheduleData])

  const lowestInterestLabel = useMemo(() => {
    if (!bothValid) return ''
    const interestA = results[0].totals.totalInterest
    const interestB = results[1].totals.totalInterest
    if (interestA === interestB) return 'either option'
    return interestA < interestB ? options[0].label : options[1].label
  }, [bothValid, results, options])

  const breakEvenMonth = useMemo(() => {
    if (!bothValid || !scheduleRows || scheduleRows.length === 0) return null
    
    const option1Months = results[0].computed.months
    const option2Months = results[1].computed.months
    
    // Only calculate if one option is longer than the other
    if (option1Months === option2Months) return null
    
    // Find crossover with tax (using exact same calculation as monthly table)
    let prevDiffWithTax = null
    let withTax = null
    for (const row of scheduleRows) {
      const taxRate = 0.15
      const tax1 = row.portfolioGain > 0 ? row.portfolioGain * taxRate : 0
      const tax2 = row.portfolioGainAlt > 0 ? row.portfolioGainAlt * taxRate : 0
      const afterTax1 = row.portfolioValue - tax1
      const afterTax2 = row.portfolioValueAlt - tax2
      const equity1 = results[0]?.computed?.principal - row.balanceA
      const equity2 = results[1]?.computed?.principal - row.balanceB
      const diff = (afterTax1 + equity1) - (afterTax2 + equity2)
      
      if (prevDiffWithTax !== null && prevDiffWithTax * diff < 0) {
        withTax = row.month
        break
      }
      prevDiffWithTax = diff
    }
    
    // Find crossover without tax
    let prevDiffNoTax = null
    let noTax = null
    for (const row of scheduleRows) {
      const equity1 = results[0]?.computed?.principal - row.balanceA
      const equity2 = results[1]?.computed?.principal - row.balanceB
      const diff = (row.portfolioValue + equity1) - (row.portfolioValueAlt + equity2)
      
      if (prevDiffNoTax !== null && prevDiffNoTax * diff < 0) {
        noTax = row.month
        break
      }
      prevDiffNoTax = diff
    }
    
    return { withTax, noTax }
  }, [bothValid, scheduleRows, results])

  const outcomeSummary = useMemo(() => {
    if (!bothValid || !scheduleData.meta?.end) return null
    const payoffMonth = Math.min(results[0].computed.months, results[1].computed.months)
    const payoffRow = scheduleData.rows[payoffMonth - 1]
    const end = scheduleData.meta.end
    const interestA = results[0].totals.totalInterest
    const interestB = results[1].totals.totalInterest
    const lowerInterestIndex = interestA === interestB ? null : interestA < interestB ? 0 : 1
    const interestSaved = end.interestDeltaSum
    const portfolioOption1 = end.portfolioValue
    const portfolioOption2 = end.portfolioValueAlt
    const portfolioGain1 = end.portfolioGain
    const portfolioGain2 = end.portfolioGainAlt
    
    // Apply 15% long-term capital gains tax to portfolio gains
    const taxRate = 0.15
    const tax1 = Number.isFinite(portfolioGain1) && portfolioGain1 > 0 ? portfolioGain1 * taxRate : 0
    const tax2 = Number.isFinite(portfolioGain2) && portfolioGain2 > 0 ? portfolioGain2 * taxRate : 0
    const afterTaxPortfolio1 = portfolioOption1 - tax1
    const afterTaxPortfolio2 = portfolioOption2 - tax2

    const netOption1 =
      afterTaxPortfolio1 + (lowerInterestIndex === 0 ? interestSaved : 0)
    const netOption2 =
      afterTaxPortfolio2 + (lowerInterestIndex === 1 ? interestSaved : 0)

    if (!Number.isFinite(netOption1) || !Number.isFinite(netOption2)) return null

    const diff = netOption1 - netOption2
    const winnerIndex = diff === 0 ? null : diff > 0 ? 0 : 1

    const portfolioTotal = payoffRow
      ? payoffRow.portfolioValue + payoffRow.portfolioValueAlt
      : end.portfolioValue + end.portfolioValueAlt
    const longerIndex = results[0].computed.months === results[1].computed.months
      ? 0
      : results[0].computed.months > results[1].computed.months ? 0 : 1
    const payoffTotal = payoffRow
      ? (longerIndex === 0 ? payoffRow.balanceA : payoffRow.balanceB)
      : Number.NaN

    return {
      winnerIndex,
      diff: Math.abs(diff),
      netOption1,
      netOption2,
      portfolioTotal,
      payoffTotal,
      payoffYears: payoffRow ? payoffRow.month / 12 : null,
      breakEvenMonthWithTax: breakEvenMonth?.withTax,
      breakEvenMonthNoTax: breakEvenMonth?.noTax,
    }
  }, [bothValid, scheduleData, results, breakEvenMonth])


  const formatCurrency = (value) =>
    Number.isFinite(value) ? currencyFormatter.format(value) : '—'
  const formatPercent = (value) =>
    Number.isFinite(value) ? `${value.toFixed(2)}%` : '—'
  const formatNumber = (value) => (Number.isFinite(value) ? value.toFixed(2) : '—')
  const getRateClass = (rate) => {
    if (!Number.isFinite(rate) || !Number.isFinite(returnRateValue)) return ''
    return rate > returnRateValue ? 'rate-bad' : 'rate-good'
  }

  const getPurchaseDownClass = (option, field) => {
    const purchaseValue = parseNumber(option.purchasePrice)
    const downValue = parseNumber(option.downPercent)
    const hasPurchase = Number.isFinite(purchaseValue)
    const hasDown = Number.isFinite(downValue)
    const isNa = option[field] === 'n/a'

    if (!isNa) return ''
    if (hasPurchase !== hasDown) return 'na-field warning-field'
    return 'na-field'
  }

  const getBreakEvenHoverText = (row, index) => {
    if (!row || !Number.isFinite(row.breakEvenRate)) return ''
    if (!Number.isFinite(returnRateValue) || outcomeSummary?.winnerIndex === null) {
      return `Break-even return: ${row.breakEvenLabel}`
    }

    const isAbove = returnRateValue >= row.breakEvenRate
    const isWinner = outcomeSummary?.winnerIndex === index
    const direction = isWinner ? (isAbove ? 'above' : 'below') : (isAbove ? 'below' : 'above')
    return `This loan is superior ${direction} the following rate of return: ${row.breakEvenLabel}`
  }

  const handleOptionChange = (index, field, value) => {
    setOptions((prev) =>
      prev.map((option, optionIndex) => {
        if (optionIndex !== index) return option
        const nextOption = { ...option, [field]: value }

        if (field === 'principal') {
          return { ...nextOption, purchasePrice: 'n/a', downPercent: 'n/a' }
        }

        if (field === 'purchasePrice' || field === 'downPercent') {
          const purchasePrice = parseNumber(nextOption.purchasePrice)
          const downPercent = parseNumber(nextOption.downPercent)
          if (Number.isFinite(purchasePrice) && Number.isFinite(downPercent)) {
            const loanAmount = purchasePrice * (1 - downPercent / 100)
            return {
              ...nextOption,
              principal: Number.isFinite(loanAmount)
                ? String(Math.max(loanAmount, 0).toFixed(2))
                : 'n/a',
            }
          }
          return { ...nextOption, principal: 'n/a' }
        }

        return nextOption
      })
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Mortgage comparison</p>
          <h1>Mortgage ROI calculator</h1>
          <p className="subtitle">
            Learn what reinvesting the difference between loans could do for you.
          </p>
        </div>
        <div className="return-card">
          <label>
            <span>Rate of return (annual %)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={returnRate}
              onChange={(event) => setReturnRate(event.target.value)}
            />
          </label>
          <p className="helper">Used to estimate portfolio value from payment deltas.</p>
        </div>
      </header>

      <section className="options">
        {options.map((option, index) => {
          const result = results[index]
          const pmiValue = parseNumber(option.pmi)
          const showPmiLabel = Number.isFinite(pmiValue) && pmiValue > 0
          return (
            <div className="option-card" key={option.id}>
              <div className="option-header">
                <input
                  className="option-title-input"
                  type="text"
                  value={option.label}
                  onChange={(event) =>
                    handleOptionChange(index, 'label', event.target.value)
                  }
                  aria-label={`Option ${index + 1} title`}
                />
                {result?.missingField && (
                  <span className="badge">Missing: {result.missingField}</span>
                )}
              </div>
              <div className="field-grid">
                <label>
                  <span>Purchase price</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={getPurchaseDownClass(option, 'purchasePrice')}
                    value={option.purchasePrice}
                    onChange={(event) =>
                      handleOptionChange(index, 'purchasePrice', event.target.value)
                    }
                    placeholder="n/a"
                  />
                </label>
                <label>
                  <span>% down</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={getPurchaseDownClass(option, 'downPercent')}
                    value={option.downPercent}
                    onChange={(event) =>
                      handleOptionChange(index, 'downPercent', event.target.value)
                    }
                    placeholder="n/a"
                  />
                </label>
                <label>
                  <span>Loan amount</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={option.principal === 'n/a' ? 'na-field' : ''}
                    value={option.principal}
                    onChange={(event) =>
                      handleOptionChange(index, 'principal', event.target.value)
                    }
                    placeholder="n/a"
                  />
                </label>
                <label>
                  <span>Years</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={option.years}
                    onChange={(event) => {
                      const value = event.target.value
                      const nextValue = value === '' ? '' : String(Math.max(1, Math.round(Number(value))))
                      handleOptionChange(index, 'years', nextValue)
                    }}
                    placeholder="Leave blank"
                  />
                </label>
                <label>
                  <span>Interest rate (annual %)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={option.rate}
                    onChange={(event) =>
                      handleOptionChange(index, 'rate', event.target.value)
                    }
                    placeholder="Leave blank"
                  />
                </label>
                <label>
                  <span>Monthly payment</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={option.payment}
                    onChange={(event) =>
                      handleOptionChange(index, 'payment', event.target.value)
                    }
                    placeholder="Leave blank"
                  />
                </label>
                <label>
                  <span>Additional closing costs</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={option.closingCosts}
                    onChange={(event) =>
                      handleOptionChange(index, 'closingCosts', event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>PMI (monthly)</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={option.pmi}
                    onChange={(event) =>
                      handleOptionChange(index, 'pmi', event.target.value)
                    }
                  />
                </label>
              </div>

              {result?.error ? (
                <p className="error">{result.error}</p>
              ) : (
                <div className="summary-grid">
                  <div>
                    <span>Monthly payment</span>
                    <strong>{formatCurrency(result.computed.paymentWithPmi)}</strong>
                  </div>
                  <div>
                    <span>{showPmiLabel ? 'Total interest + PMI' : 'Total interest'}</span>
                    <strong>{formatCurrency(result.totals.totalInterest)}</strong>
                  </div>
                  <div>
                    <span>Loan term</span>
                    <strong>{formatNumber(result.computed.years)} yrs</strong>
                  </div>
                  <div>
                    <span>Rate</span>
                    <strong>{formatPercent(result.computed.rate)}</strong>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="results">
        <div className="results-header">
          <h2>Outcome summary</h2>
          <div className="equation">
            <span className="equation__term">Net wealth</span>
            <span className="equation__symbol">=</span>
            <span className="equation__term">Portfolio 1</span>
            <span className="equation__symbol">-</span>
            <span className="equation__symbol">(</span>
            <span className="equation__term">Portfolio 2</span>
            <span className="equation__symbol">+</span>
            <span className="equation__term">Interest saved</span>
            <span className="equation__symbol">)</span>
          </div>
        </div>
        {outcomeSummary ? (
          <div className="summary-grid">
            <div>
              <span>{options[0].label} net wealth</span>
              <strong className="outcome-highlight">{formatCurrency(outcomeSummary.netOption1)}</strong>
            </div>
            <div>
              <span>{options[1].label} net wealth</span>
              <strong className="outcome-highlight">{formatCurrency(outcomeSummary.netOption2)}</strong>
            </div>
            <div>
              <span>Difference</span>
              <strong>
                {outcomeSummary.winnerIndex === null
                  ? 'Even'
                  : (
                    <>
                      You'll have accumulated{' '}
                      <span className="outcome-highlight">{formatCurrency(outcomeSummary.diff)}</span>
                      {' '}more wealth with {options[outcomeSummary.winnerIndex].label} after{' '}
                      {Math.round(results[outcomeSummary.winnerIndex]?.computed?.years || 0)} years
                    </>
                  )}
              </strong>
            </div>
            <div>
              <span>Portfolio & payoff</span>
              <strong>
                You could amass a portfolio of <span className="outcome-highlight">{formatCurrency(outcomeSummary.portfolioTotal)}</span> at your expected interest rate, while the remaining principal balance of your loan after <span className="outcome-highlight">{Math.round(Math.min(results[0]?.computed?.years || 0, results[1]?.computed?.years || 0))}</span> years would be <span className="outcome-highlight">{formatCurrency(outcomeSummary.payoffTotal)}</span>.
                <br></br>
                Your net gain at the time of loan payoff would be <span className="outcome-highlight">{formatCurrency(outcomeSummary.portfolioTotal - outcomeSummary.payoffTotal)}</span>.
              </strong>
            </div>
            {outcomeSummary.breakEvenMonthWithTax && (
              <div>
                <span>Strategy crossover point</span>
                <strong>
                  {(() => {
                    const lowerPaymentIndex = results[0].computed.payment < results[1].computed.payment ? 0 : 1
                    const higherPaymentIndex = lowerPaymentIndex === 0 ? 1 : 0
                    const withTax = outcomeSummary.breakEvenMonthWithTax
                    const noTax = outcomeSummary.breakEvenMonthNoTax
                    const hasDifference = noTax && withTax !== noTax
                    return (
                      <>
                        {`The ${options[lowerPaymentIndex].label} + investment strategy will overtake the ${options[higherPaymentIndex].label} strategy at month `}
                        <span className="outcome-highlight">{withTax}</span>
                        {` (year `}
                        <span className="outcome-highlight">{(withTax / 12).toFixed(1)}</span>
                        {`)`}
                        {hasDifference && (
                          <>
                            {`. Without taxes considered: month `}
                            <span className="outcome-highlight">{noTax}</span>
                            {` (year `}
                            <span className="outcome-highlight">{(noTax / 12).toFixed(1)}</span>
                            {`)`}
                          </>
                        )}
                        {`.`}
                      </>
                    )
                  })()}
                </strong>
              </div>
            )}
          </div>
        ) : (
          <p className="muted">Complete both options to see the outcome summary.</p>
        )}
      </section>

      <section className="results">
        <div className="results-header">
          <h2>Comparison table</h2>
          <p className="subtitle">
            Deltas compare each option against the other over its own term.
          </p>
        </div>
        {bothValid ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Option</th>
                  <th>Monthly payment</th>
                  <th>Total payments</th>
                  <th>Total interest</th>
                  <th>Interest saved by using ({lowestInterestLabel || '—'})</th>
                  <th>Portfolio value</th>
                  <th>Portfolio gain</th>
                  <th>Break-even return (annual %)</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, index) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{formatCurrency(row.payment)}</td>
                    <td>{formatCurrency(row.totalPayment)}</td>
                    <td>
                      {formatCurrency(row.totalInterest)}
                      {Number.isFinite(row.pmiAmount) && row.pmiAmount > 0 && row.pmiEndMonth
                        ? (
                          <div className="muted">
                            Includes PMI of: <br></br>
                            {formatCurrency(row.pmiAmount)} * {row.pmiEndMonth} = {formatCurrency(row.pmiTotal)}
                          </div>
                        )
                        : null}
                    </td>
                    <td>{formatCurrency(row.interestDelta)}</td>
                    <td
                      title={Number.isFinite(row.portfolioValue) ? `Before tax: ${formatCurrency(row.portfolioValue)}\n15% Tax on gains: ${formatCurrency(row.taxAmount)}\nAfter tax: ${formatCurrency(row.afterTaxPortfolioValue)}` : ''}
                    >
                      {formatCurrency(row.afterTaxPortfolioValue)}
                    </td>
                    <td
                      title={Number.isFinite(row.portfolioGain) ? `Before tax: ${formatCurrency(row.portfolioGain)}\n15% Tax: ${formatCurrency(row.taxAmount)}\nAfter tax: ${formatCurrency(row.afterTaxPortfolioGain)}` : ''}
                    >
                      {formatCurrency(row.afterTaxPortfolioGain)}
                    </td>
                    <td
                      className={getRateClass(row.breakEvenRate)}
                      title={getBreakEvenHoverText(row, index)}
                    >
                      {row.breakEvenLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Complete both options (exactly one blank each) to see results.</p>
        )}
      </section>

      <section className="results">
        <div className="results-header">
          <h2>Monthly status table</h2>
          <p className="subtitle">
            Month-by-month view using higher payment minus lower payment deltas.
          </p>
        </div>
        {bothValid ? (
          <div className="table-wrapper monthly-table">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Payment ({options[0].label})</th>
                  <th>Payment ({options[1].label})</th>
                  <th>Payment savings (sum)</th>
                  <th>Interest saved by using ({lowestInterestLabel || '—'})</th>
                  <th>Portfolio value (option 1)</th>
                  <th>Portfolio value (option 2)</th>
                  <th>Portfolio gain (option 1)</th>
                  <th>Portfolio gain (option 2)</th>
                  <th>Net value difference</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((row) => (
                  <tr key={row.month} className={row.month % 12 === 0 ? 'year-row' : ''}>
                    <td>
                      {row.month}
                      {row.month % 12 === 0
                        ? (
                          <span className="year-marker">
                            {` (${row.month / 12} year${row.month / 12 === 1 ? '' : 's'})`}
                          </span>
                        )
                        : ''}
                    </td>
                    <td
                      title={`Principal: ${formatCurrency(row.principalPaidA)}\nInterest: ${formatCurrency(row.interestPaidA)}\nTotal Principal Earned: ${formatCurrency(results[0]?.computed?.principal - row.balanceA)}`}
                    >
                      {formatCurrency(row.paymentA)}
                    </td>
                    <td
                      title={`Principal: ${formatCurrency(row.principalPaidB)}\nInterest: ${formatCurrency(row.interestPaidB)}\nTotal Principal Earned: ${formatCurrency(results[1]?.computed?.principal - row.balanceB)}`}
                    >
                      {formatCurrency(row.paymentB)}
                    </td>
                    <td>{formatCurrency(row.deltaSum)}</td>
                    <td>{formatCurrency(row.interestDeltaSum)}</td>
                    <td
                      title={Number.isFinite(row.portfolioValue) && Number.isFinite(row.portfolioGain) ? `Before tax: ${formatCurrency(row.portfolioValue)}\n15% Tax on gains: ${formatCurrency(row.portfolioGain > 0 ? row.portfolioGain * 0.15 : 0)}\nAfter tax: ${formatCurrency(row.portfolioValue - (row.portfolioGain > 0 ? row.portfolioGain * 0.15 : 0))}` : ''}
                    >
                      {formatCurrency(row.portfolioValue)}
                    </td>
                    <td
                      title={Number.isFinite(row.portfolioValueAlt) && Number.isFinite(row.portfolioGainAlt) ? `Before tax: ${formatCurrency(row.portfolioValueAlt)}\n15% Tax on gains: ${formatCurrency(row.portfolioGainAlt > 0 ? row.portfolioGainAlt * 0.15 : 0)}\nAfter tax: ${formatCurrency(row.portfolioValueAlt - (row.portfolioGainAlt > 0 ? row.portfolioGainAlt * 0.15 : 0))}` : ''}
                    >
                      {formatCurrency(row.portfolioValueAlt)}
                    </td>
                    <td
                      title={Number.isFinite(row.portfolioGain) ? `Before tax: ${formatCurrency(row.portfolioGain)}\n15% Tax: ${formatCurrency(row.portfolioGain > 0 ? row.portfolioGain * 0.15 : 0)}\nAfter tax: ${formatCurrency(row.portfolioGain - (row.portfolioGain > 0 ? row.portfolioGain * 0.15 : 0))}` : ''}
                    >
                      {formatCurrency(row.portfolioGain)}
                    </td>
                    <td
                      title={Number.isFinite(row.portfolioGainAlt) ? `Before tax: ${formatCurrency(row.portfolioGainAlt)}\n15% Tax: ${formatCurrency(row.portfolioGainAlt > 0 ? row.portfolioGainAlt * 0.15 : 0)}\nAfter tax: ${formatCurrency(row.portfolioGainAlt - (row.portfolioGainAlt > 0 ? row.portfolioGainAlt * 0.15 : 0))}` : ''}
                    >
                      {formatCurrency(row.portfolioGainAlt)}
                    </td>
                    <td>
                      {(() => {
                        const taxRate = 0.15
                        const tax1 = row.portfolioGain > 0 ? row.portfolioGain * taxRate : 0
                        const tax2 = row.portfolioGainAlt > 0 ? row.portfolioGainAlt * taxRate : 0
                        const afterTax1 = row.portfolioValue - tax1
                        const afterTax2 = row.portfolioValueAlt - tax2
                        const equity1 = results[0]?.computed?.principal - row.balanceA
                        const equity2 = results[1]?.computed?.principal - row.balanceB
                        const diff = (afterTax1 + equity1) - (afterTax2 + equity2)
                        return formatCurrency(diff)
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Complete both options (exactly one blank each) to see results.</p>
        )}
      </section>
    </div>
  )
}

export default App
