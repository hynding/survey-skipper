import type { AnswerValue, ValidationError } from 'survey-skipper';
import type { QuestionView } from './api';

export interface QuestionFieldProps {
  question: QuestionView;
  value: AnswerValue | undefined;
  /** Called with `undefined` when the input is cleared. */
  onChange: (value: AnswerValue | undefined) => void;
  errors?: ValidationError[] | undefined;
  /** True when the value came from an answer given on a path the respondent later left. */
  restored?: boolean;
}

interface Option {
  value: AnswerValue;
  label: string;
}

function options(question: QuestionView): Option[] {
  return (question.answers ?? []).map((a) => {
    const value = (a as { value?: AnswerValue }).value ?? '';
    const text = (a as { text?: string }).text;
    return { value, label: text ?? String(value) };
  });
}

/** One question's input, chosen by its type. */
export function QuestionField({ question, value, onChange, errors = [], restored = false }: QuestionFieldProps) {
  const id = `q-${String(question.id)}`;
  const errorId = `${id}-errors`;
  const described = errors.length > 0 ? errorId : undefined;
  const opts = options(question);
  const type = question.type ?? (opts.length > 0 ? 'single' : 'text');

  let input;
  switch (type) {
    case 'single':
      input = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={described}>
          {opts.map((o) => (
            <label key={String(o.value)} className="choice">
              <input type="radio" name={id} checked={value === o.value} onChange={() => { onChange(o.value); }} />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    case 'multi': {
      const selected = Array.isArray(value) ? value : [];
      input = (
        <div role="group" aria-labelledby={`${id}-label`} aria-describedby={described}>
          {opts.map((o) => (
            <label key={String(o.value)} className="choice">
              <input
                type="checkbox"
                checked={selected.includes(o.value as never)}
                onChange={(e) => {
                  onChange((e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value)) as AnswerValue);
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'boolean':
      input = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={described}>
          {[true, false].map((b) => (
            <label key={String(b)} className="choice">
              <input type="radio" name={id} checked={value === b} onChange={() => { onChange(b); }} />
              {b ? 'Yes' : 'No'}
            </label>
          ))}
        </div>
      );
      break;
    case 'rating': {
      const min = Number(question.validation?.min ?? 1);
      const max = Number(question.validation?.max ?? 5);
      const steps = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
      input = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={described} className="rating">
          {steps.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => { onChange(n); }}>
              {n}
            </button>
          ))}
        </div>
      );
      break;
    }
    case 'number':
      input = (
        <input
          id={id}
          type="number"
          aria-describedby={described}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => { onChange(e.target.value === '' ? undefined : Number(e.target.value)); }}
        />
      );
      break;
    case 'date':
      input = (
        <input id={id} type="date" aria-describedby={described} value={typeof value === 'string' ? value : ''} onChange={(e) => { onChange(e.target.value); }} />
      );
      break;
    default:
      input = (
        <textarea id={id} rows={3} aria-describedby={described} value={typeof value === 'string' ? value : ''} onChange={(e) => { onChange(e.target.value); }} />
      );
  }

  return (
    <fieldset className={errors.length > 0 ? 'question invalid' : 'question'}>
      <label id={`${id}-label`} htmlFor={id} className="prompt">
        {question.displayText}
        {question.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {restored ? <p className="note">We kept your earlier answer to this question.</p> : null}
      {input}
      {errors.length > 0 ? (
        <ul id={errorId} className="errors" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
