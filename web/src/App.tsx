import { Navigate, Outlet, Route, Routes } from "react-router";
import { Layout } from "@/components/layout/layout.tsx";
import {
  ADMIN_PATH,
  LOGIN_PATH,
  REGISTER_PATH,
  SEARCH_PATH,
} from "@/utils/path.ts";
import React, { Suspense } from "react";
import { useAuth } from "@/features/auth/use-auth.ts";
import { AbsoluteCenter, Box, Center } from "@chakra-ui/react";
import { Loading } from "@/components/loading.tsx";
import { ProtectedRoute } from "@/features/auth/protected-route.tsx";

function App() {
  const { currentUser, isLoading } = useAuth();

  return isLoading ? (
    <Box position="relative" height="100vh" width="100vw">
      <AbsoluteCenter>
        <Loading size="xl" />
      </AbsoluteCenter>
    </Box>
  ) : (
    <Routes>
      <Route element={<Layout />}>
        <Route path={SEARCH_PATH} element={<LazySearchPage />} />
      </Route>

      <Route
        element={
          <Suspense
            fallback={
              <Center boxSize="full">
                <Loading />
              </Center>
            }
          >
            <Outlet />
          </Suspense>
        }
      >
        <Route
          path={ADMIN_PATH}
          element={
            <ProtectedRoute
              currentUser={currentUser}
              permissionPredicate={(user) => user.isAdmin}
            >
              <LazyAdminPage />
            </ProtectedRoute>
          }
        />
        {!currentUser && (
          <Route path={LOGIN_PATH} element={<LazyLoginPage />} />
        )}
        <Route path={REGISTER_PATH} element={<LazyRegisterPage />} />
        <Route path="*" element={<Navigate to={SEARCH_PATH} replace />} />
      </Route>
    </Routes>
  );
}

const LazySearchPage = React.lazy(() => import("./pages/search"));
const LazyAdminPage = React.lazy(() => import("./pages/admin"));
const LazyLoginPage = React.lazy(() => import("./pages/login"));
const LazyRegisterPage = React.lazy(() => import("./pages/register"));

export default App;
