/**
 * Test utilities — custom render function with all required providers.
 *
 * Usage:
 *   import { render, screen } from "@/test/utils";
 *   render(<MyComponent />);
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, RenderOptions } from "@testing-library/react";
import React from "react";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";

interface WrapperOptions extends RenderOptions {
  routerProps?: MemoryRouterProps;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,        // Don't retry in tests
        staleTime: 0,
      },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  { routerProps, ...renderOptions }: WrapperOptions = {}
) {
  const queryClient = makeQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter {...routerProps}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// Re-export everything from RTL so tests can import from a single location
export * from "@testing-library/react";
export { renderWithProviders as render };
