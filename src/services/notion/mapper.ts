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

// ── Session → Notion ────────────────────────────────────────

export function sessionToNotionProperties(
  session: WorkoutSession,
  isNew: boolean = false,
): Record<string, unknown> {
  const cat = session.category.charAt(0).toUpperCase() + session.category.slice(1);
  const name = `${cat} L${session.level} — ${session.date.slice(0, 10)}`;

  const props: Record<string, unknown> = {
    Name: titleProp(name),
    Date: dateProp(session.date),
    Category: selectProp(session.category),
    Level: numberProp(session.level),
    Exercises: richText(JSON.stringify(session.exercises)),
    'contrl ID': richText(session.id),
  };

  if (session.notes) {
    props.Notes = richText(session.notes);
  }

  if (isNew && session.createdAt) {
    props['Created At'] = dateProp(session.createdAt);
  }

  return props;
}

// ── Notion → Session ────────────────────────────────────────

export function notionPageToSession(page: NotionPage): {
  session: Partial<WorkoutSession>;
  contrlId: string | null;
} {
  const p = page.properties;

  const contrlId = getText(p['contrl ID']) || null;
  const category = (getSelect(p.Category) ?? 'push') as Category;
  const level = getNumber(p.Level) ?? 1;
  const date = getDate(p.Date) ?? page.created_time;
  const notes = getText(p.Notes) || undefined;
  const createdAt = getDate(p['Created At']) ?? page.created_time;

  let exercises: ExerciseEntry[] = [];
  const exercisesText = getText(p.Exercises);
  if (exercisesText) {
    try {
      exercises = JSON.parse(exercisesText);
    } catch {
      // invalid JSON — leave empty
    }
  }

  return {
    session: {
      id: contrlId ?? `notion-${page.id}`,
      date,
      level,
      category,
      exercises,
      notes,
      createdAt,
      notionPageId: page.id,
      updatedAt: page.last_edited_time,
    },
    contrlId,
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
    'Is Hold': checkboxProp(exercise.isHold),
    'Sort Order': numberProp(exercise.sortOrder ?? 0),
  };

  if (exercise.targetHoldSeconds) {
    props['Hold Seconds'] = numberProp(exercise.targetHoldSeconds);
  }

  return props;
}

// ── Notion → Exercise ───────────────────────────────────────

export function notionPageToExercise(page: NotionPage): Exercise {
  const p = page.properties;

  return {
    id: getText(p.Name).toLowerCase().replace(/\s+/g, '-') + `-${page.id.slice(0, 8)}`,
    name: getText(p.Name),
    category: (getSelect(p.Category) ?? 'push') as Category,
    level: getNumber(p.Level) ?? 1,
    targetSets: getNumber(p['Target Sets']) ?? 3,
    targetReps: getNumber(p['Target Reps']) ?? 10,
    isHold: getCheckbox(p['Is Hold']),
    targetHoldSeconds: getNumber(p['Hold Seconds']) ?? undefined,
    sortOrder: getNumber(p['Sort Order']) ?? 0,
    notionPageId: page.id,
    updatedAt: page.last_edited_time,
  };
}
