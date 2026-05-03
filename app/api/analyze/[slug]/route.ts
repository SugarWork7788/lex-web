import Anthropic from "@anthropic-ai/sdk";
import {
  CONSTITUTION_SLUG,
  loadFullLaw,
  extractConcepts,
  searchRelevantLaws,
  formatLawForPrompt,
  estimateTokens,
  type AnalysisLaw,
  type Pass2Stats,
  type SearchProgress,
} from "@/lib/analyze-context";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

// ---- Module-level cache (per warm Lambda instance) ----
type CachedCorpus = {
  constitution: AnalysisLaw | null;
  relatedLaws: AnalysisLaw[];
  lawsMap: Record<string, string>;
  stats: Pass2Stats;
  timestamp: number;
};

const CORPUS_CACHE = new Map<string, CachedCorpus>();
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;

function cacheGet(slug: string): CachedCorpus | null {
  const entry = CORPUS_CACHE.get(slug);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    CORPUS_CACHE.delete(slug);
    return null;
  }
  // LRU touch.
  CORPUS_CACHE.delete(slug);
  CORPUS_CACHE.set(slug, entry);
  return entry;
}

function cachePut(slug: string, entry: CachedCorpus) {
  if (CORPUS_CACHE.size >= CACHE_MAX_ENTRIES) {
    const firstKey = CORPUS_CACHE.keys().next().value;
    if (firstKey) CORPUS_CACHE.delete(firstKey);
  }
  CORPUS_CACHE.set(slug, entry);
}

// ---- Prompts ----

const PASS3_SYSTEM = `Ти си правен анализатор на българското законодателство.
Получаваш основен закон, Конституцията на Република България, и подбран набор от
свързани разпоредби от цялата база на 1240 български закона, открити чрез full-text
search по ключовите концепции на основния закон.

Задачата ти е да намериш реални правни проблеми.

Търси следното:
1. КОНСТИТУЦИОННО НАРУШЕНИЕ — член от основния закон противоречи пряко на Конституцията
2. КОНФЛИКТ МЕЖДУ ЗАКОНИ — основният закон противоречи на друг закон или кодекс по същата материя
3. НАДХВЪРЛЯНЕ НА ПРАВОМОЩИЯ — наредба или правилник надхвърля правомощията, дадени от закона
4. ВЪТРЕШНО ПРОТИВОРЕЧИЕ — два члена в същия закон си противоречат
5. МЪРТВА ПРЕПРАТКА — законът препраща към отменен или несъществуващ член
6. ПРАВНА ПРАЗНИНА — закон задължава нещо но не урежда как, кой или кога
7. НЕЯСНА ФОРМУЛИРОВКА — текст, допускащ противоречиво тълкуване водещо до различно прилагане

За всеки намерен проблем върни ТОЧНО един JSON обект на отделен ред.
Никакъв друг текст. Никакви обяснения извън JSON. Само JSON редове (NDJSON).
Никакви markdown код-блокове. Никакви коментари. Никакви прелюдии.

Полето "type" ТРЯБВА да е една от тези стойности (на български, главни букви):
"КОНСТИТУЦИОННО НАРУШЕНИЕ", "КОНФЛИКТ МЕЖДУ ЗАКОНИ", "НАДХВЪРЛЯНЕ НА ПРАВОМОЩИЯ",
"ВЪТРЕШНО ПРОТИВОРЕЧИЕ", "МЪРТВА ПРЕПРАТКА", "ПРАВНА ПРАЗНИНА", "НЕЯСНА ФОРМУЛИРОВКА".

Полето "severity" ТРЯБВА да е точно една от: "нисък", "среден", "висок".

Формат на всеки ред (един JSON обект, без нов ред вътре):
{"type":"ТИП","severity":"нисък|среден|висок","explanation":"Обяснение на ясен български без правен жаргон. 2-4 изречения.","primary_law_slug":"slug","primary_articles":["5","12а"],"conflicting_law_slug":"slug или null","conflicting_articles":["3","7"],"quote_primary":"Точен цитат","quote_conflicting":"Точен цитат или null"}

Изисквания:
- primary_law_slug ВИНАГИ е slugът на основния анализиран закон.
- conflicting_law_slug е slug на другия закон или null ако проблемът е вътрешен.
- primary_articles и conflicting_articles са масиви от номера на членове като strings.
- quote_primary и quote_conflicting са кратки точни цитати.
- Можеш да използваш само разпоредбите, които са ти подадени. Не измисляй членове.`;

const PASS4_SYSTEM = `Ти си правен анализатор. Получаваш конкретен предполагаем правен проблем
и пълните текстове на двата засегнати закона.

Задачата ти: при по-внимателен прочит, потвърди или опровергай проблема и дай по-точно обяснение.

Върни ЕДИН JSON ред, нищо друго:
{"verified":true|false,"refined_explanation":"Подробно обяснение базирано на пълния контекст на двата закона. 3-5 изречения. Без markdown."}

- "verified": true ако проблемът е реален при пълен контекст; false ако всъщност няма противоречие.
- "refined_explanation": Конкретно, точно обяснение. Цитирай номера на членове, ако е уместно.`;

// ---- Stream event types ----

type StreamEvent =
  | { event: "phase"; phase: string; message: string; data?: unknown }
  | { event: "laws_map"; laws_map: Record<string, string>; stats: unknown; cached?: boolean }
  | { event: "issue"; id: string; [k: string]: unknown }
  | { event: "issue_update"; id: string; [k: string]: unknown }
  | { event: "saved"; analysis_id: string }
  | { event: "save_failed"; reason: string }
  | { event: "done"; total: number }
  | { event: "fatal"; message: string };

type RuntimeUpdate = {
  verified?: boolean;
  refined_explanation?: string;
};

async function persistAnalysis(args: {
  targetSlug: string;
  targetName: string;
  lawsAnalyzedCount: number;
  durationSeconds: number;
  issues: Array<Record<string, unknown> & { id: string }>;
  updates: Map<string, RuntimeUpdate>;
}): Promise<{ id: string } | { error: string }> {
  const sevCount = { висок: 0, среден: 0, нисък: 0 };
  for (const i of args.issues) {
    const sev = (i as Record<string, unknown>).severity;
    if (sev === "висок" || sev === "среден" || sev === "нисък") sevCount[sev]++;
  }

  const { data: analysisRow, error: insErr } = await supabase
    .from("law_analyses")
    .insert({
      law_slug: args.targetSlug,
      law_name_bg: args.targetName,
      laws_analyzed: args.lawsAnalyzedCount,
      duration_seconds: args.durationSeconds,
      total_issues: args.issues.length,
      issues_high: sevCount["висок"],
      issues_medium: sevCount["среден"],
      issues_low: sevCount["нисък"],
    })
    .select("id")
    .single();
  if (insErr || !analysisRow) {
    return { error: insErr?.message ?? "insert returned no row" };
  }

  if (args.issues.length > 0) {
    const rows = args.issues.map((i) => {
      const r = i as Record<string, unknown>;
      const u = args.updates.get(i.id) ?? {};
      const sev = r.severity === "висок" || r.severity === "среден" || r.severity === "нисък" ? r.severity : "среден";
      const arr = (v: unknown): string[] =>
        Array.isArray(v) ? v.map(String).filter(Boolean) : [];
      return {
        analysis_id: analysisRow.id,
        law_slug: args.targetSlug,
        type: typeof r.type === "string" ? r.type : "НЕЯСНА ФОРМУЛИРОВКА",
        severity: sev,
        explanation: typeof r.explanation === "string" ? r.explanation : "",
        primary_law_slug:
          typeof r.primary_law_slug === "string" ? r.primary_law_slug : args.targetSlug,
        primary_articles: arr(r.primary_articles),
        conflicting_law_slug:
          typeof r.conflicting_law_slug === "string" && r.conflicting_law_slug
            ? r.conflicting_law_slug
            : null,
        conflicting_articles: arr(r.conflicting_articles),
        quote_primary: typeof r.quote_primary === "string" ? r.quote_primary : null,
        quote_conflicting:
          typeof r.quote_conflicting === "string" ? r.quote_conflicting : null,
        verified: typeof u.verified === "boolean" ? u.verified : null,
        refined_explanation:
          typeof u.refined_explanation === "string" && u.refined_explanation
            ? u.refined_explanation
            : null,
      };
    });
    const { error: issuesErr } = await supabase.from("law_issues").insert(rows);
    if (issuesErr) {
      return { error: issuesErr.message };
    }
  }

  return { id: analysisRow.id };
}

// ---- Prompt builders ----

function buildPass3UserMessage(
  target: AnalysisLaw,
  constitution: AnalysisLaw | null,
  related: AnalysisLaw[],
): string {
  const parts: string[] = [];
  parts.push(
    `ОСНОВЕН ЗАКОН: ${target.name_bg} (slug: ${target.slug})\n${formatLawForPrompt(target)}`,
  );
  if (constitution) {
    parts.push(
      `\n\nКОНСТИТУЦИЯ НА РЕПУБЛИКА БЪЛГАРИЯ (slug: ${constitution.slug}):\n${formatLawForPrompt(constitution)}`,
    );
  }
  if (related.length > 0) {
    parts.push(
      `\n\nСВЪРЗАНИ РАЗПОРЕДБИ ОТ ДРУГИ ЗАКОНИ (избрани чрез full-text search):`,
    );
    for (const r of related) {
      parts.push(
        `\n--- ${r.name_bg} (slug: ${r.slug}, категория: ${r.category}) ---\n${formatLawForPrompt(r)}`,
      );
    }
  }
  return parts.join("");
}

function buildPass4UserMessage(
  issue: Record<string, unknown>,
  target: AnalysisLaw,
  conflicting: AnalysisLaw,
): string {
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.map(String).join(", ") : String(v ?? "");
  return [
    `ПРЕДПОЛАГАЕМ ПРОБЛЕМ`,
    `Тип: ${issue.type ?? ""}`,
    `Сериозност: ${issue.severity ?? ""}`,
    `Обяснение: ${issue.explanation ?? ""}`,
    `Засегнати членове в ${target.name_bg}: ${arr(issue.primary_articles)}`,
    `Конфликт с членове в ${conflicting.name_bg}: ${arr(issue.conflicting_articles)}`,
    `Цитат от основния закон: ${issue.quote_primary ?? ""}`,
    `Цитат от конфликтиращия закон: ${issue.quote_conflicting ?? ""}`,
    ``,
    `ПЪЛЕН ТЕКСТ НА ОСНОВНИЯ ЗАКОН (${target.name_bg}):`,
    formatLawForPrompt(target),
    ``,
    `ПЪЛЕН ТЕКСТ НА КОНФЛИКТИРАЩИЯ ЗАКОН (${conflicting.name_bg}):`,
    formatLawForPrompt(conflicting),
  ].join("\n");
}

// =====================================================================
// Route handler
// =====================================================================

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      const failFatal = (msg: string) => {
        emit({ event: "fatal", message: msg });
        controller.close();
      };

      try {
        // ---- PRELUDE: load target ----
        const target = await loadFullLaw(slug);
        if (!target) {
          failFatal("Не е намерен закон или няма заредено съдържание");
          return;
        }

        // ---- Cache check ----
        const cached = cacheGet(slug);
        let constitution: AnalysisLaw | null = null;
        let relatedLaws: AnalysisLaw[] = [];
        let stats: Pass2Stats;
        let usedCache = false;

        if (cached) {
          usedCache = true;
          const ageMin = Math.round((Date.now() - cached.timestamp) / 60000);
          emit({
            event: "phase",
            phase: "cache_hit",
            message: "Използвам кеширани резултати от по-ранен анализ",
            data: { age_minutes: ageMin },
          });
          constitution = cached.constitution;
          relatedLaws = cached.relatedLaws;
          stats = cached.stats;
          emit({
            event: "laws_map",
            laws_map: cached.lawsMap,
            stats,
            cached: true,
          });
        } else {
          // ---- PARALLEL: Pass 1 (concepts) + constitution load ----
          emit({
            event: "phase",
            phase: "concepts",
            message: "Извличам ключови концепции и зареждам Конституцията…",
          });

          const wantConstitution = target.slug !== CONSTITUTION_SLUG;
          const constitutionPromise: Promise<AnalysisLaw | null> = wantConstitution
            ? loadFullLaw(CONSTITUTION_SLUG)
            : Promise.resolve(null);

          const [concepts, constitutionResolved] = await Promise.all([
            extractConcepts(target),
            constitutionPromise,
          ]);
          constitution = constitutionResolved;

          emit({
            event: "phase",
            phase: "concepts_done",
            message: `Намерих ${concepts.terms.length} ключови термина`,
            data: {
              terms: concepts.terms.length,
              entities: concepts.entities.length,
            },
          });

          // ---- PASS 2: corpus FTS + token-budgeted selection ----
          const targetTokens = estimateTokens(formatLawForPrompt(target));
          const constitutionTokens = constitution
            ? estimateTokens(formatLawForPrompt(constitution))
            : 0;
          const MAX_INPUT_BUDGET = 180_000;
          const SYSTEM_OVERHEAD = 3_000;
          const availableTokenBudget = Math.max(
            20_000,
            MAX_INPUT_BUDGET - targetTokens - constitutionTokens - SYSTEM_OVERHEAD,
          );

          emit({
            event: "phase",
            phase: "search",
            message: "Търся в 1240 закона по ключовите концепции…",
            data: {
              token_budget_for_corpus: availableTokenBudget,
              target_tokens: targetTokens,
              constitution_tokens: constitutionTokens,
            },
          });

          const exclude = new Set<string>([target.slug, CONSTITUTION_SLUG]);

          // Live-progress mirror, snapshotted by 3s heartbeat.
          let liveProgress: SearchProgress = {
            searched_terms: 0,
            queries_done: 0,
            articles_found: 0,
            laws_loaded: 0,
            laws_total_to_load: 0,
          };
          const heartbeat = setInterval(() => {
            const lt = liveProgress.laws_total_to_load;
            const ll = liveProgress.laws_loaded;
            const message =
              lt > 0
                ? `Заредени ${ll} от ${lt} закона…`
                : `Изпълних ${liveProgress.queries_done} от ${liveProgress.searched_terms} заявки…`;
            emit({
              event: "phase",
              phase: "search_progress",
              message,
              data: { ...liveProgress },
            });
          }, 3000);

          let searchResult;
          try {
            searchResult = await searchRelevantLaws(concepts, exclude, {
              availableTokenBudget,
              onProgress: (p) => {
                liveProgress = p;
              },
            });
          } finally {
            clearInterval(heartbeat);
          }
          relatedLaws = searchResult.laws;
          stats = searchResult.stats;

          emit({
            event: "phase",
            phase: "search_done",
            message: `Намерих ${stats.unique_articles} релевантни статии в ${stats.laws_touched} закона`,
            data: stats,
          });

          // Build laws_map and emit.
          const lawsMap: Record<string, string> = {
            [target.slug]: target.name_bg,
          };
          if (constitution) lawsMap[constitution.slug] = constitution.name_bg;
          for (const l of relatedLaws) lawsMap[l.slug] = l.name_bg;
          emit({ event: "laws_map", laws_map: lawsMap, stats });

          // Cache for next run.
          cachePut(slug, {
            constitution,
            relatedLaws,
            lawsMap,
            stats,
            timestamp: Date.now(),
          });
        }

        // ---- PASS 3: deep conflict analysis (streaming) ----
        const pass3UserMessage = buildPass3UserMessage(
          target,
          constitution,
          relatedLaws,
        );
        const pass3Tokens = estimateTokens(pass3UserMessage);
        console.log(
          `[analyze:${slug}] pass3: target=${target.articles.length}art constitution=${constitution?.articles.length ?? 0}art related=${relatedLaws.length}laws/${stats.unique_articles}art ~tokens=${pass3Tokens} cached=${usedCache}`,
        );

        emit({
          event: "phase",
          phase: "analyze",
          message: "Дълбок анализ за конфликти и противоречия…",
        });

        const client = new Anthropic();
        const issues: Array<Record<string, unknown> & { id: string }> = [];

        // Speculative loads for Pass 4: kicked off during Pass 3 streaming.
        const speculativeLoads = new Map<
          string,
          Promise<AnalysisLaw | null>
        >();
        const SPECULATIVE_CAP = 8;

        const claudeStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          system: PASS3_SYSTEM,
          messages: [{ role: "user", content: pass3UserMessage }],
        });

        let buffer = "";
        let counter = 0;

        const handleParsedIssue = (parsed: Record<string, unknown>) => {
          const id = `i${counter++}`;
          const issue: Record<string, unknown> & { id: string } = {
            ...parsed,
            id,
          };
          issues.push(issue);
          emit({ event: "issue", ...issue });

          // Speculatively start loading the conflicting law for висок issues
          // so its full text is in memory by the time Pass 4 fires.
          const sev = parsed.severity;
          const cls = parsed.conflicting_law_slug;
          if (
            sev === "висок" &&
            typeof cls === "string" &&
            cls &&
            !speculativeLoads.has(cls) &&
            speculativeLoads.size < SPECULATIVE_CAP
          ) {
            speculativeLoads.set(cls, loadFullLaw(cls));
          }
        };

        claudeStream.on("text", (delta) => {
          buffer += delta;
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
              const parsed = JSON.parse(line);
              if (typeof parsed !== "object" || parsed === null) continue;
              handleParsedIssue(parsed as Record<string, unknown>);
            } catch {
              // incomplete line — wait for more bytes
            }
          }
        });

        await claudeStream.finalMessage();

        // Tail flush.
        const tail = buffer.trim();
        if (tail) {
          try {
            const parsed = JSON.parse(tail);
            if (typeof parsed === "object" && parsed !== null) {
              handleParsedIssue(parsed as Record<string, unknown>);
            }
          } catch {
            // ignore
          }
        }

        emit({
          event: "phase",
          phase: "analyze_done",
          message: `Открити ${issues.length} ${issues.length === 1 ? "проблем" : "проблема"}`,
          data: { total: issues.length },
        });

        // ---- PASS 4: deep-dive on top висок issues, in parallel ----
        const highIssues = issues
          .filter((i) => {
            const r = i as Record<string, unknown>;
            return (
              r.severity === "висок" &&
              typeof r.conflicting_law_slug === "string" &&
              r.conflicting_law_slug
            );
          })
          .slice(0, 3);

        const runtimeUpdates = new Map<string, RuntimeUpdate>();

        if (highIssues.length > 0) {
          emit({
            event: "phase",
            phase: "deep_dive",
            message: `Задълбочен анализ за ${highIssues.length} критични ${highIssues.length === 1 ? "проблема" : "проблема"}…`,
            data: { count: highIssues.length },
          });

          await Promise.allSettled(
            highIssues.map(async (issue) => {
              const conflictingSlug = issue.conflicting_law_slug as string;
              try {
                emit({
                  event: "issue_update",
                  id: issue.id,
                  status: "verifying",
                });
                // Reuse the speculative load if it was started during Pass 3.
                const conflicting = await (speculativeLoads.get(
                  conflictingSlug,
                ) ?? loadFullLaw(conflictingSlug));
                if (!conflicting) {
                  emit({
                    event: "issue_update",
                    id: issue.id,
                    status: "skipped",
                    note: "Конфликтиращият закон не може да бъде зареден",
                  });
                  return;
                }
                const userMessage = buildPass4UserMessage(
                  issue,
                  target,
                  conflicting,
                );
                const response = await client.messages.create({
                  model: "claude-sonnet-4-6",
                  max_tokens: 1500,
                  system: PASS4_SYSTEM,
                  messages: [{ role: "user", content: userMessage }],
                });
                const block = response.content.find((b) => b.type === "text");
                const text =
                  block && block.type === "text" ? block.text.trim() : "";
                const cleaned = text
                  .replace(/^```(?:json)?\s*/i, "")
                  .replace(/```\s*$/i, "")
                  .trim();
                let result: { verified?: boolean; refined_explanation?: string } = {};
                try {
                  result = JSON.parse(cleaned);
                } catch {
                  emit({
                    event: "issue_update",
                    id: issue.id,
                    status: "error",
                    note: "Неуспешно парсване на дълбоко проучване",
                  });
                  return;
                }
                runtimeUpdates.set(issue.id, {
                  verified: Boolean(result.verified),
                  refined_explanation: result.refined_explanation ?? "",
                });
                emit({
                  event: "issue_update",
                  id: issue.id,
                  status: "verified",
                  verified: Boolean(result.verified),
                  refined_explanation: result.refined_explanation ?? "",
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(
                  `[analyze:${slug}] pass4 error for ${issue.id}: ${msg}`,
                );
                emit({
                  event: "issue_update",
                  id: issue.id,
                  status: "error",
                  note: msg,
                });
              }
            }),
          );
        }

        // ---- PERSIST: save analysis + issues to Supabase ----
        const lawsAnalyzedCount =
          1 + (constitution ? 1 : 0) + relatedLaws.length;
        const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
        try {
          const result = await persistAnalysis({
            targetSlug: slug,
            targetName: target.name_bg,
            lawsAnalyzedCount,
            durationSeconds,
            issues,
            updates: runtimeUpdates,
          });
          if ("error" in result) {
            console.error(`[analyze:${slug}] save failed: ${result.error}`);
            emit({ event: "save_failed", reason: result.error });
          } else {
            emit({ event: "saved", analysis_id: result.id });
          }
        } catch (saveErr) {
          const msg = saveErr instanceof Error ? saveErr.message : String(saveErr);
          console.error(`[analyze:${slug}] save threw: ${msg}`);
          emit({ event: "save_failed", reason: msg });
        }

        emit({ event: "done", total: issues.length });
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[analyze:${slug}] fatal: ${msg}`);
        try {
          failFatal(msg);
        } catch {
          // controller already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
