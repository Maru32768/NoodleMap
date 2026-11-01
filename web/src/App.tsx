import { MobileFooter } from "@/components/layout/mobile-footer.tsx";
import { Loading } from "@/components/loading.tsx";
import { ProtectedRoute } from "@/features/auth/protected-route.tsx";
import { useAuth } from "@/features/auth/use-auth.ts";
import {
  CurrentUserProvider,
  toCurrentUser,
} from "@/features/auth/use-current-user.ts";
import {
  ACCOUNT_PATH,
  ADMIN_PATH,
  LOGIN_PATH,
  MEAL_RECORDS_PATH,
  SEARCH_PATH,
} from "@/utils/path.ts";
import { AbsoluteCenter, Box } from "@chakra-ui/react";
import React, { Suspense, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";

function App() {
  const { currentUser: authUser, isLoading, error: authError } = useAuth();
  const currentUser = toCurrentUser(authUser, !!authError);
  const location = useLocation();
  // Rebuilding the map is slow, so the search page stays mounted (hidden)
  // while the user is on a page the footer or a record links to.
  const onSearch = location.pathname === SEARCH_PATH;
  const [searchMounted, setSearchMounted] = useState(onSearch);
  if (onSearch && !searchMounted) {
    setSearchMounted(true);
  }
  const showSearch =
    onSearch || (searchMounted && keepsSearchAlive(location.pathname));

  useEffect(() => {
    const isAdminPath = location.pathname.startsWith(ADMIN_PATH);
    const manifestHref = isAdminPath
      ? "/admin-manifest.webmanifest"
      : "/manifest.webmanifest";
    const touchIconHref = isAdminPath ? "/admin-pwa-512.png" : "/pwa-512.png";
    let manifestLink = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    let touchIconLink = document.querySelector<HTMLLinkElement>(
      'link[rel="apple-touch-icon"]',
    );

    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      document.head.append(manifestLink);
    }

    manifestLink.href = manifestHref;
    if (!touchIconLink) {
      touchIconLink = document.createElement("link");
      touchIconLink.rel = "apple-touch-icon";
      document.head.append(touchIconLink);
    }

    touchIconLink.href = touchIconHref;
  }, [location.pathname]);

  return isLoading ? (
    <Box position="relative" height="100vh" width="100vw">
      <AbsoluteCenter>
        <Loading size="xl" />
      </AbsoluteCenter>
    </Box>
  ) : (
    <CurrentUserProvider value={currentUser}>
      {/* Before <Routes> so a page's title effect runs after the hidden map's. */}
      {showSearch && (
        <Box boxSize="full" display={onSearch ? undefined : "none"}>
          <Suspense
            fallback={
              <AbsoluteCenter>
                <Loading size="xl" />
              </AbsoluteCenter>
            }
          >
            <LazySearchPage active={onSearch} />
          </Suspense>
        </Box>
      )}
      <Routes>
        {/* Rendered above, so the map survives a trip to another page. */}
        <Route path={SEARCH_PATH} element={null} />

        <Route
          element={
            <Suspense
              fallback={
                <AbsoluteCenter>
                  <Loading size="xl" />
                </AbsoluteCenter>
              }
            >
              <Outlet />
            </Suspense>
          }
        >
          <Route path="/venues/:venueId" element={<LazyVenuePage />} />
          <Route path={MEAL_RECORDS_PATH} element={<LazyMealRecordsPage />} />
          <Route
            path={`${ADMIN_PATH}/*`}
            element={
              <ProtectedRoute
                permissionPredicate={(user) => {
                  return user.type === "admin";
                }}
              >
                <LazyAdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path={ACCOUNT_PATH}
            element={
              <ProtectedRoute>
                <LazyAccountPage />
              </ProtectedRoute>
            }
          />
          {currentUser.type === "guest" && (
            <Route path={LOGIN_PATH} element={<LazyLoginPage />} />
          )}
          <Route path="*" element={<Navigate to={SEARCH_PATH} replace />} />
        </Route>
      </Routes>
      {!location.pathname.startsWith(ADMIN_PATH) &&
        location.pathname !== LOGIN_PATH && <MobileFooter />}
    </CurrentUserProvider>
  );
}

function keepsSearchAlive(pathname: string) {
  return (
    pathname === MEAL_RECORDS_PATH ||
    pathname === ACCOUNT_PATH ||
    pathname.startsWith("/venues/")
  );
}

const LazySearchPage = React.lazy(() => import("./pages/search"));
const LazyAdminPage = React.lazy(() => import("./pages/admin"));
const LazyLoginPage = React.lazy(() => import("./pages/login"));
const LazyAccountPage = React.lazy(() => import("./pages/account"));
const LazyVenuePage = React.lazy(() => import("./pages/venue"));
const LazyMealRecordsPage = React.lazy(() => import("./pages/meal-records"));

export default App;
