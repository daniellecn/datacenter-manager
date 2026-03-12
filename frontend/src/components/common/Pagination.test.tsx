/**
 * Tests for the Pagination component.
 */
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/utils";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("renders nothing when there is only one page", () => {
    const { container } = render(
      <Pagination page={1} size={50} total={10} onChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders page info text for multiple pages", () => {
    render(<Pagination page={1} size={10} total={100} onChange={vi.fn()} />);
    expect(screen.getByText(/1–10 of 100/)).toBeInTheDocument();
  });

  it("renders page counter", () => {
    render(<Pagination page={2} size={10} total={100} onChange={vi.fn()} />);
    expect(screen.getByText(/2 \/ 10/)).toBeInTheDocument();
  });

  it("previous button is disabled on first page", () => {
    render(<Pagination page={1} size={10} total={100} onChange={vi.fn()} />);
    const [prev] = screen.getAllByRole("button");
    expect(prev).toBeDisabled();
  });

  it("next button is disabled on last page", () => {
    render(<Pagination page={10} size={10} total={100} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    const next = buttons[buttons.length - 1];
    expect(next).toBeDisabled();
  });

  it("calls onChange with previous page when prev button clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={3} size={10} total={100} onChange={onChange} />);
    const [prev] = screen.getAllByRole("button");
    await user.click(prev);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("calls onChange with next page when next button clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={3} size={10} total={100} onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    const next = buttons[buttons.length - 1];
    await user.click(next);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("renders last page range correctly", () => {
    render(<Pagination page={10} size={10} total={95} onChange={vi.fn()} />);
    // Page 10: items 91–95
    expect(screen.getByText(/91–95 of 95/)).toBeInTheDocument();
  });

  it("renders nothing when total equals zero", () => {
    const { container } = render(
      <Pagination page={1} size={10} total={0} onChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
