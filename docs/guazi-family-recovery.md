# Guazi: AITO family recovery

The 2026-10-29 public dictionary has 356 filter entries. Alliance ID 103950 is now
`AITO/LUXEED/MAEXTRO/SAIC/STELATO` (formerly Hima). It no longer contains most of the
family's live inventory. Public product data and live list queries also confirm:

| Guazi ID | Source make | Catalog brand |
|---|---|---|
| 104071 | AITO | AITO |
| 104015 | LUXEED | Luxeed |
| 104070 | STELATO | Stelato |
| 104068 | MAEXTRO | Maextro |
| 104069 | SAIC | Shangjie |

The four individual IDs omitted by `queryBrandList` are retained in
`config/guazi-core-brands.json`, with product-page provenance in
`supplementalSources`. Preserve these observed supplemental IDs when refreshing
the public filter dictionary; flattening only `data.brands` would lose them again.
SAIC is mapped to Shangjie only for the observed ID 104069. SAIC MAXUS and other
unknown identities do not receive this mapping.

Normal circles collect the alliance and all five individual makes as one AITO-family block, completing all their lists before checking any saved family car. This prevents a move between feeds from becoming a false absence, regardless of brand counts or processing order.

The list's source make and a detail page's individual make can differ. A detail
make is allowed only when it equals the selected segment's brand or is in its
explicit existing coverage. The actual make ID/name/model is saved with each
checked result. Alliance model prefixes retain each individual catalog brand;
the observed bare S800 belongs to Maextro.

## Policy snapshots

New refresh rounds save their selection policy in `<run>/policy.json`. Resumes
use that immutable policy and still validate the original signature against the
configured database. A dictionary update affects future rounds, without silently
changing an unfinished round's selection or skipping the database identity guard.

The unfinished 2026-10-28 round was pinned before the dictionary update, after
its original policy/database hash was verified. Its snapshot, run ID, successful
results, brand checkpoints and signature remain intact.

## Targeted recovery

`xvfb-run -a node scripts/repair-guazi-family.mjs --run` processes only the saved
AITO block outcomes with `brand is outside the Belarus import list` or
`source_segment_unknown`, limited to skipped/rejected results. Explicit sales,
successful results, unrelated brands and ordinary price exclusions are excluded.
It requires a stopped unfinished circle and the complete confirmed family IDs.

The repair:

1. Takes the same worker and database locks as the ordinary refresh.
2. Saves a fixed target set and the repair policy signature inside
   `<run>/guazi-huawei-v1/current.json`.
3. Completes fresh, separate discovery for the alliance and all individual makes,
   both export-eligibility partitions and the normal fuel/year filters.
4. Checks only selected IDs. A price on an unlisted detail page cannot restore a
   car; normal explicit-sale and double verified missing-page rules apply.
5. Appends replacement outcomes only after the normal database transaction has
   committed, then recomputes original-round counts from the latest result per ID.
6. Verifies selected database outcomes, FOB Horgos and photo references, performs
   the normal deduplication/sitemap finalization, and records completion.

Access/network/database/integrity failures preserve the queue. Run the same
command to resume; completed repair results are not reread. A changed repair
policy is refused and requires a separately verified migration; do not overwrite
a signature merely to suppress that guard. The original main round remains
stopped at its prior brand after the targeted repair.

The 2026-10-29 first discovery exposed the missing individual IDs after six
source-verified outcomes. Processing was stopped, the policy was extended only
with the four separately verified make IDs, and those six outcomes were audited
and retained. The original circle signature was not changed.

Installation receipts and the prior runtime/checkpoint files are under
`/srv/abcars-backups/guazi-family-repair-20261029/`. The temporary repair service
has no timer or automatic restart. Its log is
`runtime/guazi-refresh/family-repair.log`. Source access retains the existing
anonymous session, pacing and bounded known-checkbox verification; it does not
use login cookies, proxy rotation or private reports.
