/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuestionCard } from "../src/components/QuestionCard";
import { writeQuestion } from "../shared/questions";
import { getVerb } from "../shared/verbs";

afterEach(() => cleanup());

describe("teclado y lectura", () => {
  it("pide la respuesta sin autocorrección y anuncia el resultado", () => {
    const question = writeQuestion(getVerb(5), { form: "past", pair: false }, "sheet", false);
    render(<QuestionCard question={question} feedback={null} onAnswer={() => undefined} reducedMotion />);
    const input = screen.getByLabelText("Tu respuesta");
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(document.querySelector("[aria-live='polite']")).toBeTruthy();
  });
});
