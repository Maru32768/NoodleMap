import { Navigate, Route, Routes } from "react-router";
import { Layout } from "@/components/layout/layout.tsx";
import { SEARCH_PATH } from "@/utils/path.ts";
import React from "react";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path={SEARCH_PATH} element={<LazySearchPage />} />
      </Route>
      <Route path="*" element={<Navigate to={SEARCH_PATH} replace />} />
    </Routes>
  );
}

const LazySearchPage = React.lazy(() => import("./pages/search"));

export default App;
