import { useEffect, useRef } from "react";
import type { GradeResult } from "../../shared/grade";
import type { Question } from "../../shared/types";

export function QuestionCard({
  question,
  feedback,
  onAnswer,
  reducedMotion,
}: {
  question: Question;
  feedback: GradeResult | null;
  onAnswer: (value: string) => void;
  reducedMotion: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = feedback !== null && feedback.outcome !== "almost";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (question.kind !== "choice" || locked) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < question.options.length) onAnswer(question.options[index].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, onAnswer, question]);

  return (
    <form
      className="card question"
      onSubmit={(event) => {
        event.preventDefault();
        if (locked) return;
        if (question.kind === "write") onAnswer(inputRef.current?.value ?? "");
      }}
    >
      <p className="prompt">{question.prompt}</p>
      {question.help ? <p className="help">{question.help}</p> : null}
      {question.kind === "choice" ? (
        <div className="choices" role="group" aria-label="Opciones">
          {question.options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className="choice"
              disabled={locked}
              onClick={() => onAnswer(option.id)}
            >
              <span className="key">{index + 1}</span>
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <label className="write-label">
          Tu respuesta
          <input
            ref={inputRef}
            name="respuesta"
            aria-label="Tu respuesta"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            placeholder={question.placeholder}
            disabled={locked}
            onFocus={(event) =>
              event.currentTarget.scrollIntoView({
                block: "center",
                behavior: reducedMotion ? "auto" : "smooth",
              })
            }
          />
        </label>
      )}
      {question.kind === "write" && !locked ? (
        <button className="primary" type="submit">
          Comprobar
        </button>
      ) : null}
      <div className="feedback" aria-live="polite">
        {feedback ? <p className={feedback.outcome}>{feedback.explanation}</p> : null}
      </div>
    </form>
  );
}
