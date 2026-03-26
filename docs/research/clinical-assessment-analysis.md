# Clinical Assessment Analysis — Geriatric Cognitive & Health Monitoring

Reference document synthesizing clinical research on geriatric assessment practices and mapping findings to nAIber system improvements.

## 1. Cognitive Assessment — Clinical Foundations

### Standard Instruments

| Instrument | Duration | Domains | Use Case |
|---|---|---|---|
| MoCA (Montreal Cognitive Assessment) | 10-15 min | 8 domains (visuospatial, naming, attention, language, abstraction, delayed recall, orientation) | Gold standard for MCI screening |
| MMSE (Mini-Mental State Exam) | 5-10 min | Orientation, registration, attention, recall, language | Historical standard, ceiling effects in mild impairment |
| IQCODE (Informant Questionnaire) | 10-15 min | Informant-rated cognitive change across 16 items | Proxy assessment, baseline estimation |

### Key Findings for Voice-Based Assessment

**Practice effects:** Repeated MoCA administration shows learning effects, especially on word recall and serial 7s. Content rotation (alternate word lists, digit sequences) is the standard mitigation. Five word lists cycle in 5 weeks with weekly testing — adequate for now but fragile for increased frequency.

**Education/age normalization:** MoCA scores require adjustment for education (Rossetti 2011, Borland 2017). Users with ≤ primary education score ~2 points lower on average. Age 85+ shows expected decrements in delayed recall and fluency. Our system captures `educationLevel` (6 levels) but never uses it in scoring.

**Test anxiety in elderly:** First-test performance is commonly depressed by anxiety, especially in elderly facing assessment. Using first test as baseline permanently anchors baseline too low. Standard practice: use informant data (IQCODE) to create prior expectations, then blend with first test scores.

**Reliable Change Index (RCI):** `z = (X2 - X1) / sqrt(2 * SEM²)` — validates whether score changes exceed measurement error. Without RCI, drift thresholds are arbitrary and produce false-positive alerts from normal test-retest variability.

### Confounding Conditions

These conditions produce cognitive scores mimicking decline but are NOT actual cognitive decline:

| Confounder | Impact on Scores | How to Detect |
|---|---|---|
| **Depression (pseudodementia)** | Attention, concentration, processing speed all decline; can mimic MCI/early dementia | PHQ-2 screen → GDS-15 full assessment |
| **ADHD** | Attention, working memory, and executive function deficits; less common in elderly but underdiagnosed and can compound age-related decline | History from onboarding/informant data; persistent (not new-onset) attention pattern |
| **Acute illness/infection** | Global cognitive depression, especially attention and working memory | Pre-test screening question |
| **Medication changes** | Anticholinergics, benzodiazepines, opioids all impair cognition | Pre-test screening question + health check data |
| **Poor sleep** | Attention, working memory, processing speed | Health check sleep quality data |
| **Hearing loss** | Voice-based assessment particularly affected; mishearing instructions → false failures | Self-report + response pattern analysis |
| **Dehydration/nutrition** | Mild global impairment | Difficult to detect via phone |

**Critical insight:** Depression is the #1 confounding risk. A depressed user's declining scores may be treated as irreversible cognitive decline when it could be reversible pseudodementia. Without mood screening, the system cannot distinguish these cases.

## 2. Health Assessment — Clinical Foundations

### PHQ-2 Depression Screen

The PHQ-2 is the standard brief depression screen used in primary care Annual Wellness Visits (AWVs). Two questions, each scored 0-3:

1. "Over the past couple of weeks, have you been bothered by having little interest or pleasure in doing things?"
2. "Over the past couple of weeks, have you been bothered by feeling down, depressed, or hopeless?"

Score ≥ 3 (out of 6) → triggers full GDS-15. Sensitivity 83%, specificity 92% for major depressive disorder.

### GDS-15 (Geriatric Depression Scale)

15 yes/no items designed for elderly populations. Conversational tone, avoids somatic symptoms that overlap with normal aging. Score interpretation:
- 0-4: Normal
- 5-9: Mild depression
- 10-15: Moderate-severe depression

Triggered only when PHQ-2 score ≥ 3 (not administered every call).

### IADLs (Instrumental Activities of Daily Living)

IADLs are the **earliest behavioral markers of cognitive decline** — difficulties appear 2-3 years before formal MCI diagnosis. Key domains for phone assessment:

- Medication management
- Financial management (bills, money)
- Transportation / getting to appointments
- Meal preparation
- Phone use (implicitly tested by the call itself)

Any new difficulty in a previously independent domain is a **major clinical red flag**.

### Self-Reported Cognitive Changes

User's own awareness of cognitive decline is a validated clinical signal:
- "Have you noticed yourself being more forgetful than usual lately?"
- "Have you had trouble following conversations or finding the right words?"
- "Have you found yourself repeating things or asking the same questions?"

## 3. Cross-Persona Considerations

### Signal Sharing

Health and cognitive assessments must not operate in isolation:
- **Health → Cognitive:** Depression flags, sleep quality, medication changes, IADL difficulties should inform cognitive score interpretation (confounding detection)
- **Cognitive → Health:** Drift alerts should increase frequency of IADL and cognitive self-report questions

### Escalation Tiers

Clinical practice uses graduated response based on signal severity:

| Tier | Example Triggers | Response |
|---|---|---|
| 0 — Log | Normal results | Store in DB only |
| 1 — Dashboard | Minor drift, PHQ-2 ≥ 1, wellbeing dip | Notification for caregiver |
| 2 — Alert | Notable drift, GDS ≥ 5, adherence < 70%, new IADL difficulty | Notification + caregiver alert |
| 3 — SMS | Significant drift, GDS ≥ 10, distress, 3+ IADL difficulties | Notification + emergency SMS |

### Longitudinal Tracking Paradigm

The core principle is **"worse than you used to be"** — intra-individual change detection, not comparison to population norms. This requires:
- Stable personal baselines (informed by onboarding data, not just first test)
- Per-domain variance tracking (enables RCI computation)
- Confidence scoring per session (low-confidence sessions contribute less)
- Confounding detection before interpreting change

## 4. Mapping to System Improvements

| Clinical Finding | System Gap | Planned Improvement | Priority |
|---|---|---|---|
| Education/age normalization required | `educationLevel` captured, never used | `DemographicAdjustment.ts` — threshold modification | Build Now |
| First-test anxiety anchors baseline too low | First test = baseline | `BaselineInitializer.ts` — IQCODE priors + test blend | Build Now |
| Depression mimics cognitive decline | No mood screening | PHQ-2 in health check, results shared to cognitive | Build Now |
| IADLs are earliest MCI markers | Zero functional questions | IADL boolean questions in health check | Build Now |
| Health data stored as JSON blob | Structured parsing commented out | Uncomment + wire `saveHealthLog()` etc. | Build Now |
| Health and cognitive share no signals | Separate post-call pipelines | Redis signal keys with 30-day TTL | Build Now |
| No session reliability metric | Partial completion reduces weight | `ConfidenceScoring.ts` — 0-1 meta-score | Build Now |
| ADHD confounding attention/WM scores | Not tracked or screened | Onboarding/informant history; persistent attention pattern vs new-onset | Build Next |
| Drift thresholds not validated | Absolute thresholds (0.80/0.65/0.50) | `ReliableChangeDetector.ts` — per-domain RCI | Build Next |
| No health trend analysis | No trend computation from logs | `HealthTrendAnalyzer.ts` | Build Next |
| No unified escalation | Drift and health alerts separate | `EscalationService.ts` — 4-tier framework | Build Next |
| Indirect speech markers validated | Phase 5C planned, not implemented | Post-call transcript NLP extraction | Later |
| Adaptive testing improves sensitivity | Fixed 9-task battery | Supplementary probes based on decline patterns | Later |

## 5. References

- Rossetti HC et al. (2011). Normative data for the Montreal Cognitive Assessment in a population-based sample. *Neurology*, 77(13), 1272-1275.
- Borland E et al. (2017). The Montreal Cognitive Assessment: Normative data from a large Swedish population-based cohort. *JAGS*, 65(9), 1904-1909.
- Jorm AF (2004). The Informant Questionnaire on Cognitive Decline in the Elderly (IQCODE): A review. *International Psychogeriatrics*, 16(3), 275-293.
- Kroenke K et al. (2003). The Patient Health Questionnaire-2: Validity of a two-item depression screener. *Medical Care*, 41(11), 1284-1292.
- Yesavage JA et al. (1982). Development and validation of a geriatric depression screening scale. *Journal of Psychiatric Research*, 17(1), 37-49.
- Lawton MP & Brody EM (1969). Assessment of older people: Self-maintaining and instrumental activities of daily living. *The Gerontologist*, 9(3), 179-186.
