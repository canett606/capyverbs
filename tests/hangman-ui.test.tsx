/** @vitest-environment jsdom */
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Gallows } from "../src/components/Gallows";
import { HangmanScreen } from "../src/screens/HangmanScreen";
import { StoreProvider } from "../src/store";

beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    }) as MediaQueryList;
});

afterEach(() => cleanup());

describe("dibujo del ahorcado", () => {
  it("añade un trazo en cada fallo hasta completar el muñeco", () => {
    const view = render(<Gallows misses={0} />);
    expect(screen.getByRole("img", { name: "Ahorcado, 0 de 6 trazos" })).toBeTruthy();
    expect(document.querySelectorAll(".gallows path")).toHaveLength(0);
    view.rerender(<Gallows misses={1} />);
    expect(document.querySelectorAll(".gallows path")).toHaveLength(1);
    view.rerender(<Gallows misses={5} />);
    expect(document.querySelector(".gallows circle")).toBeTruthy();
    view.rerender(<Gallows misses={6} />);
    expect(screen.getByRole("img", { name: "Ahorcado, 6 de 6 trazos" })).toBeTruthy();
    expect(document.querySelectorAll(".gallows path")).toHaveLength(5);
    view.unmount();
  });
});

describe("teclado del ahorcado", () => {
  it("ofrece las 26 letras y anuncia los fallos", async () => {
    render(
      <StoreProvider>
        <HangmanScreen onExit={() => undefined} />
      </StoreProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    const letters = await screen.findAllByRole("button", { name: /^Letra / });
    expect(letters).toHaveLength(26);
    expect(letters[0]?.getAttribute("type")).toBe("button");
    fireEvent.click(screen.getByRole("button", { name: "Letra Q" }));
    expect(screen.getByRole("button", { name: "Letra Q" }).hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("[aria-live='polite']")?.textContent).toMatch(/Fallos|Escrito|La forma/);
  });

  it("intro empieza la ronda y avanza como Siguiente", async () => {
    render(
      <StoreProvider>
        <HangmanScreen onExit={() => undefined} />
      </StoreProvider>,
    );
    fireEvent.keyDown(window, { key: "Enter" });
    expect(await screen.findAllByRole("button", { name: /^Letra / })).toHaveLength(26);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText(/^1 \//)).toBeTruthy();

    for (const letter of "qazxswedcvfrtgbnhyujmkilop") {
      if (screen.queryByRole("button", { name: "Siguiente" })) break;
      const button = screen.getByRole("button", { name: `Letra ${letter.toUpperCase()}` });
      if (!button.hasAttribute("disabled")) fireEvent.click(button);
    }
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText(/^2 \//)).toBeTruthy();
  });
});
