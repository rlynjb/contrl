import type { NotionPage, NotionProperty } from '../../types/notion';
import type { WorkoutSession, ExerciseEntry, Exercise, Category } from '../../types';

// ── Helpers ─────────────────────────────────────────────────

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return '';
  if (prop.type === 'title') {
    const p = prop as { type: 'title'; title: { plain_text: string }[] };
    return p.title.map(t => t.plain_text).join('');
  }
  if (prop.type === 'rich_text') {
    const p = prop as { type: 'rich_text'; rich_text: { plain_text: string }[] };
    return p.rich_text.map(t => t.plain_text).join('');
  }
  return '';
}

function getNumber(prop: NotionProperty | undefined): number | null {
  if (!prop || prop.type !== 'number') return null;
  return (prop as { type: 'number'; number: number | null }).number;
}

function getSelect(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== 'select') return null;
  const p = prop as { type: 'select'; select: { name: string } | null };
  return p.select?.name ?? null;
}

function getDate(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== 'date') return null;
  const p = prop as { type: 'date'; date: { start: string } | null };
  return p.date?.start ?? null;
}

function getCheckbox(prop: NotionProperty | undefined): boolean {
  if (!prop || prop.type !== 'checkbox') return false;
  return (prop as { type: 'checkbox'; checkbox: boolean }).checkbox;
}

function richText(text: string): Record<string, unknown> {
  return { rich_text: [{ text: { content: text } }] };
}

function titleProp(text: string): Record<string, unknown> {
  return { title: [{ text: { content: text } }] };
}

function selectProp(name: string): Record<string, unknown> {
  return { select: { name } };
}

function numberProp(n: number): Record<string, unknown> {
  return { number: n };
}

function dateProp(date: string): Record<string, unknown> {
  return { date: { start: date } };
}

function checkboxProp(checked: boolean): Record<string, unknown> {
  return { checkbox: checked };
}

function relationProp(pageIds: string[]): Record<string, unknown> {
  return { relation: pageIds.map(id => ({ id })) };
}

function getRelation(prop: NotionProperty | undefined): string[] {
  if (!prop || prop.type !== 'relation') return [];
  const p = prop as { type: 'relation'; relation: { id: string }[] };
  return p.relation.map(r => r.id);
}


// ── Session → Notion ────────────────────────────────────────

export function sessionToNotionProperties(
  session: WorkoutSession,
  exerciseNotionPageIds?: string[],
): Record<string, unknown> {
  const cat = session.category.charAt(0).toUpperCase() + session.category.slice(1);
  const name = `${cat} L${session.level} — ${session.date.slice(0, 10)}`;

  const props: Record<string, unknown> = {
    Name: titleProp(name),
    Date: dateProp(session.date),
    Category: selectProp(session.category),
    Level: numberProp(session.level),
    'Session Data': richText(JSON.stringify(session.exercises)),
    'contrl ID': richText(session.id),
  };

  if (exerciseNotionPageIds && exerciseNotionPageIds.length > 0) {
    props.Exercises = relationProp(exerciseNotionPageIds);
  }

  if (session.notes) {
    props.Notes = richText(session.notes);
  }

  if (session.passed !== undefined) {
    props.Passed = checkboxProp(session.passed);
  }

  return props;
}

// ── Notion → Session ────────────────────────────────────────

export function notionPageToSession(page: NotionPage): {
  session: Partial<WorkoutSession>;
  contrlId: string | null;
  exerciseRelationIds: string[];
} {
  const p = page.properties;

  const contrlId = getText(p['contrl ID']) || null;
  const category = ((getSelect(p.Category) ?? 'push').toLowerCase()) as Category;
  const level = getNumber(p.Level) ?? 1;
  const date = getDate(p.Date) ?? page.created_time;
  const notes = getText(p.Notes) || undefined;

  let exercises: ExerciseEntry[] = [];
  const sessionDataText = getText(p['Session Data']);
  if (sessionDataText) {
    try {
      exercises = JSON.parse(sessionDataText);
    } catch {
      // invalid JSON — fall back to legacy field
      const legacyText = getText(p.Exercises);
      if (legacyText) {
        try { exercises = JSON.parse(legacyText); } catch { /* empty */ }
      }
    }
  }

  const exerciseRelationIds = getRelation(p.Exercises);
  const passed = getCheckbox(p.Passed) || undefined;

  return {
    session: {
      id: contrlId ?? `notion-${page.id}`,
      date,
      level,
      category,
      exercises,
      notes,
      passed,
      notionPageId: page.id,
      updatedAt: page.last_edited_time,
    },
    contrlId,
    exerciseRelationIds,
  };
}

// ── Exercise → Notion ───────────────────────────────────────

export function exerciseToNotionProperties(exercise: Exercise): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Name: titleProp(exercise.name),
    Category: selectProp(exercise.category),
    Level: numberProp(exercise.level),
    'Target Sets': numberProp(exercise.targetSets),
    'Target Reps': numberProp(exercise.targetReps),
    'Sort Order': numberProp(exercise.sortOrder ?? 0),
  };

  if (exercise.tempo) {
    props.Tempo = richText(exercise.tempo);
  }

  if (exercise.notes) {
    props.Notes = richText(exercise.notes);
  }


  return props;
}

// ── Notion → Exercise ───────────────────────────────────────

export function notionPageToExercise(page: NotionPage): Exercise {
  const p = page.properties;

  return {
    id: page.id,
    name: getText(p.Name),
    category: ((getSelect(p.Category) ?? 'push').toLowerCase()) as Category,
    level: getNumber(p.Level) ?? 1,
    targetSets: getNumber(p['Target Sets']) ?? 3,
    targetReps: getNumber(p['Target Reps']) ?? 10,
    isHold: (getText(p.Tempo) || '') === 'Steady',
    sortOrder: getNumber(p['Sort Order']) ?? 0,
    tempo: getText(p.Tempo) || undefined,
    notes: getText(p.Notes) || undefined,
    notionPageId: page.id,
    updatedAt: page.last_edited_time,
  };
}
