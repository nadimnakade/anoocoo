# Anooco Logic & Algorithms

## 1. Voice Intent Mapping
Anooco uses a keyword-spotting approach (or NLU if available) to map raw speech to intent types.

| Trigger Phrase | Intent | Category |
| :--- | :--- | :--- |
| "Accident", "Crash", "Collision" | `REPORT_ACCIDENT` | Critical |
| "Pothole", "Bad road", "Bump" | `REPORT_HAZARD` | Warning |
| "Police", "Camera", "Trap" | `REPORT_ENFORCEMENT` | Info |
| "Traffic", "Stuck", "Jam" | `REPORT_TRAFFIC` | Info |
| "Park", "Spot here", "Leaving now" | `OFFER_PARKING` | Utility |
| "Lift", "Ride", "Seat" | `OFFER_LIFT` | Utility |

**Normalization:**
- "Police ahead" -> `Type: ENFORCEMENT`, `Direction: Forward`
- "Pothole here" -> `Type: HAZARD`, `Location: Current GPS`

## 2. Event Clustering Logic
To prevent spam and duplicate markers, we use a spatial clustering approach (simplified DBSCAN).

**Algorithm:**
1. **Input:** New Report $R_{new}$ at $(lat, lon)$ at time $t$.
2. **Search:** Query active events $E$ within radius $r$ (e.g., 50m) and time window $\Delta t$ (e.g., 30 mins).
3. **Match:**
   - IF matching Event $E_{match}$ found:
     - Add $R_{new}$ as confirmation to $E_{match}$.
     - Update $E_{match}$ confidence score.
     - Extend $E_{match}$ validity time.
   - ELSE:
     - Create new Event $E_{new}$ from $R_{new}$.
     - Set initial confidence based on user trust.

**Directionality:**
- For `TRAFFIC` and `ENFORCEMENT`, we also compare the `heading` vector. Reports must be within $\pm 30^\circ$ to cluster.

## 3. Trust Scoring Algorithm
Trust is the currency of Anooco. It determines if a report creates an immediate alert or waits for confirmation.

**Score Range:** 0 to 100 (Default: 50).

**Updates:**
$$ T_{new} = T_{old} + \Delta $$

| Action | $\Delta$ | Condition |
| :--- | :--- | :--- |
| Report Confirmed by others | +5 | Another user validates your event |
| Report Rejected by others | -10 | Users vote "Not here" |
| False Alarm (Auto-detected) | -5 | No confirmations within 30 mins |
| Consistent Reporting | +1 | 5 accurate reports in a row |

**Impact on System:**
- **High Trust (>75):** Reports create "Instant Alerts" for nearby drivers.
- **Medium Trust (30-75):** Reports require 1 confirmation before alerting.
- **Low Trust (<30):** Reports require 3 confirmations. Hidden from standard view.
