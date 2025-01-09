import { Navigate, Route, Routes } from "react-router";
import { Layout } from "@/components/layout/layout.tsx";
import { ADMIN_PATH, LOGIN_PATH, SEARCH_PATH } from "@/utils/path.ts";
import React from "react";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path={SEARCH_PATH} element={<LazySearchPage />} />
      </Route>
      <Route path={ADMIN_PATH} element={<LazyAdminPage />} />
      <Route path={LOGIN_PATH} element={<LazyLoginPage />} />
      <Route path="*" element={<Navigate to={SEARCH_PATH} replace />} />
    </Routes>
  );
}

const LazySearchPage = React.lazy(() => import("./pages/search"));
const LazyAdminPage = React.lazy(() => import("./pages/admin"));
const LazyLoginPage = React.lazy(() => import("./pages/login"));

export default App;
