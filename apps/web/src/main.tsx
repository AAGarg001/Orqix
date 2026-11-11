import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrqixApp as App } from "./orqix/OrqixApp";
import {ErrorBoundary} from './orqix/ErrorBoundary';
import { BlobFilter } from "./orqix/BlobButton";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 1000 } },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BlobFilter />
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <ErrorBoundary><App /></ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
