import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { AddDraft, AddModal } from "@/features/admin/add-modal.tsx";
import { AdminFilters, VisitFilter } from "@/features/admin/admin-filters.tsx";
import { AdminMap } from "@/features/admin/admin-map.tsx";
import { AdminTable } from "@/features/admin/admin-table.tsx";
import { MobileShopList } from "@/features/admin/mobile-shop-list.tsx";
import {
  UpdateShopCommand,
  useShops,
} from "@/features/shops/api/use-shops.ts";
import {
  ShopEditDraft,
  ShopEditModal,
} from "@/features/shops/shop-edit-modal.tsx";
import type { CategoryType } from "@/features/search/utils.ts";
import { toastApiError } from "@/utils/toast.ts";
import { Box, Input, Span } from "@chakra-ui/react";
import { useCallback, useDeferredValue, useState } from "react";
import { CiLocationOn, CiSearch } from "react-icons/ci";
import { LuPlus } from "react-icons/lu";

type MobileAdminView = "list" | "map";

function AdminStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "warning";
}) {
  return (
    <Box
      fontFamily="mono"
      fontSize="11px"
      color="nm.inkMuted"
      letterSpacing="0.05em"
    >
      <Span
        fontFamily="display"
        fontSize="16px"
        color={tone === "warning" ? "nm.shuDeep" : "nm.ink"}
        mr="4px"
        fontWeight="700"
      >
        {value}
      </Span>
      {label}
    </Box>
  );
}

function AdminSearchBox({
  keyword,
  onKeywordChange,
  placement,
}: {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  placement: "header" | "mobile";
}) {
  const input = (
    <Box position="relative">
      <Box
        as={CiSearch}
        position="absolute"
        left="12px"
        top="50%"
        transform="translateY(-50%)"
        w="14px"
        h="14px"
        color="nm.inkMuted"
        pointerEvents="none"
        zIndex="1"
      />
      <Input
        placeholder="店名・住所で絞り込み..."
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        w="100%"
        pl="36px"
        pr="14px"
        py="9px"
        h="auto"
        bg="nm.bg"
        border="1px solid"
        borderColor="nm.line"
        rounded="nmMd"
        fontSize="13px"
        color="nm.ink"
        outline="none"
        transition="border-color 0.15s, background 0.15s"
        _focus={{ borderColor: "nm.shu", bg: "white", boxShadow: "none" }}
      />
    </Box>
  );

  if (placement === "mobile") {
    return (
      <Box
        display={{ base: "block", md: "none" }}
        px="12px"
        py="10px"
        bg="nm.paper"
        borderBottom="1px solid"
        borderBottomColor="nm.line"
      >
        {input}
      </Box>
    );
  }

  return (
    <Box
      flex="1"
      maxW="480px"
      position="relative"
      display={{ base: "none", md: "block" }}
    >
      {input}
    </Box>
  );
}

export default function AdminPage() {
  const { shops, addShop, updateShop } = useShops();

  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);
  const [categoryFilter, setCategoryFilter] = useState<CategoryType>("all");
  const [visitFilter, setVisitFilter] = useState<VisitFilter>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileAdminView>("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<"info" | "visit" | "images">("info");
  const [showAdd, setShowAdd] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [addingMode, setAddingMode] = useState(false);
  const [draftLatLng, setDraftLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const filtered =
    shops?.filter((shop) => {
      if (deferredKeyword) {
        const kw = deferredKeyword.toLowerCase();
        if (
          !shop.name.toLowerCase().includes(kw) &&
          !shop.address.toLowerCase().includes(kw)
        ) {
          return false;
        }
      }
      if (categoryFilter !== "all") {
        if (shop.category !== categoryFilter) {
          return false;
        }
      }
      if (visitFilter === "eaten") {
        return shop.eaten && !shop.closed;
      }
      if (visitFilter === "wish") {
        return !shop.eaten && !shop.closed;
      }
      if (visitFilter === "closed") {
        return shop.closed;
      }
      return true;
    }) ?? [];

  const total = shops?.length ?? 0;
  const eatenCount = shops?.filter((r) => r.eaten).length ?? 0;
  const wishCount =
    shops?.filter((r) => !r.eaten && !r.closed).length ?? 0;
  const editShop = shops?.find((r) => r.id === editId);

  const handleEdit = (id: string, tab?: "images") => {
    setEditId(id);
    setEditTab(tab ?? "info");
  };

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setMobileView("list");
  }, []);

  const handleSave = async (draft: ShopEditDraft) => {
    const cmd: UpdateShopCommand = {
      name: draft.name,
      lat: draft.lat,
      lng: draft.lng,
      postalCode: draft.postalCode,
      address: draft.address,
      closed: draft.closed,
      googlePlaceId: draft.googlePlaceId,
      category: draft.category,
      eaten: draft.eaten,
      favorite: draft.favorite,
      rate: draft.rate,
    };
    const result = await updateShop(draft.id, cmd);
    if (!result.ok) {
      toastApiError(result.error, {
        fallbackTitle: "店舗を更新できませんでした",
      });
      return;
    }

    setEditId(null);
    toaster.success({ description: "保存しました" });
  };

  const handleAdd = async (draft: AddDraft) => {
    const result = await addShop(draft);
    if (!result.ok) {
      toastApiError(result.error, {
        fallbackTitle: "店舗を追加できませんでした",
      });
      return;
    }

    setShowAdd(false);
    setDraftLatLng(null);
    toaster.success({ description: "店舗を追加しました" });
  };

  const handleMapClick = useCallback(
    (latlng: { lat: number; lng: number } | null) => {
      if (!latlng) {
        setAddingMode(false);
        setDraftLatLng(null);
        return;
      }
      setDraftLatLng(latlng);
      setAddingMode(false);
      setShowAdd(true);
    },
    [],
  );

  return (
    <Box
      display="grid"
      gridTemplateRows={{ base: "52px 1fr", md: "56px 1fr" }}
      h="100vh"
      w="100vw"
      bg="nm.bg"
      overflow="hidden"
    >
      {/* Topbar */}
      <Box
        as="header"
        display="flex"
        alignItems="center"
        gap="16px"
        px={{ base: "12px", md: "18px" }}
        bg="nm.paper"
        borderBottom="1px solid"
        borderBottomColor="nm.line"
        zIndex="800"
        position="relative"
      >
        <Box display="flex" alignItems="center" gap="12px" flexShrink="0">
          <Box
            boxSize="32px"
            rounded="full"
            bg="nm.ink"
            color="nm.paper"
            display="grid"
            placeItems="center"
            fontFamily="display"
            fontWeight="700"
            fontSize="15px"
            position="relative"
            flexShrink="0"
            _after={{
              content: '""',
              position: "absolute",
              top: "-2px",
              right: "-2px",
              w: "8px",
              h: "8px",
              rounded: "full",
              bg: "nm.shu",
              border: "1.5px solid",
              borderColor: "nm.paper",
            }}
          >
            麺
          </Box>
          <Box
            as="span"
            fontFamily="mono"
            fontSize="9px"
            letterSpacing="0.18em"
            bg="nm.ink"
            color="nm.paper"
            px="7px"
            py="3px"
            rounded="3px"
            ml="6px"
          >
            ADMIN
          </Box>
        </Box>

        <AdminSearchBox
          keyword={keyword}
          onKeywordChange={setKeyword}
          placement="header"
        />

        <Box
          display={{ base: "none", md: "flex" }}
          gap="18px"
          alignItems="baseline"
        >
          <AdminStat value={total} label="店舗" />
          <AdminStat value={eatenCount} label="食べた" />
          <AdminStat value={wishCount} label="気になる" tone="warning" />
        </Box>

        <Box position="relative" ml="auto">
          <Button
            variant="plain"
            display="flex"
            alignItems="center"
            gap="6px"
            px="14px"
            py="8px"
            h="auto"
            minH="auto"
            rounded="nmMd"
            bg="nm.shu"
            color="white"
            fontSize="13px"
            fontWeight={600}
            _hover={{ bg: "nm.shuDeep" }}
            onClick={() => setShowAddMenu((v) => !v)}
          >
            <LuPlus />
            店舗追加
          </Button>

          {showAddMenu && (
            <>
              <Box
                position="fixed"
                inset="0"
                zIndex="850"
                onClick={() => setShowAddMenu(false)}
              />
              <Box
                position="absolute"
                top="calc(100% + 6px)"
                right="0"
                zIndex="860"
                bg="nm.paper"
                border="1px solid"
                borderColor="nm.line"
                rounded="nmMd"
                boxShadow="nmLg"
                minW="260px"
                p="6px"
                display="flex"
                flexDirection="column"
                gap="2px"
                animation="adm-modal-in 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)"
              >
                <Button
                  variant="plain"
                  display="flex"
                  alignItems="center"
                  gap="12px"
                  p="10px 12px"
                  rounded="6px"
                  textAlign="left"
                  w="100%"
                  justifyContent="flex-start"
                  fontFamily="body"
                  _hover={{ bg: "nm.bg" }}
                  onClick={() => {
                    setShowAddMenu(false);
                    setShowAdd(true);
                  }}
                >
                  <Box
                    w="32px"
                    h="32px"
                    rounded="6px"
                    bg="nm.bg"
                    color="nm.shu"
                    display="grid"
                    placeItems="center"
                    flexShrink="0"
                  >
                    <CiSearch />
                  </Box>
                  <Box display="flex" flexDirection="column" gap="1px" minW="0">
                    <Box
                      as="span"
                      fontSize="13px"
                      fontWeight="600"
                      color="nm.ink"
                    >
                      Googleで検索して追加
                    </Box>
                    <Box as="span" fontSize="11px" color="nm.inkMuted">
                      Google Placeから自動入力
                    </Box>
                  </Box>
                </Button>
                <Button
                  variant="plain"
                  display="flex"
                  alignItems="center"
                  gap="12px"
                  p="10px 12px"
                  rounded="6px"
                  textAlign="left"
                  w="100%"
                  justifyContent="flex-start"
                  fontFamily="body"
                  _hover={{ bg: "nm.bg" }}
                  onClick={() => {
                    setShowAddMenu(false);
                    setAddingMode(true);
                    setMobileView("map");
                  }}
                >
                  <Box
                    w="32px"
                    h="32px"
                    rounded="6px"
                    bg="nm.bg"
                    color="nm.shu"
                    display="grid"
                    placeItems="center"
                    flexShrink="0"
                  >
                    <CiLocationOn />
                  </Box>
                  <Box display="flex" flexDirection="column" gap="1px" minW="0">
                    <Box
                      as="span"
                      fontSize="13px"
                      fontWeight="600"
                      color="nm.ink"
                    >
                      地図上でピンを立てて追加
                    </Box>
                    <Box as="span" fontSize="11px" color="nm.inkMuted">
                      地図をクリックして位置を指定
                    </Box>
                  </Box>
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Main */}
      <Box
        display="grid"
        gridTemplateColumns={{ base: "1fr", lg: "minmax(380px, 0.9fr) 1.6fr" }}
        h="100%"
        minH="0"
        overflow="hidden"
      >
        {/* Map pane */}
        {shops && (
          <AdminMap
            shops={shops}
            filtered={filtered}
            selectedId={selectedId}
            onSelect={handleSelect}
            addingMode={addingMode}
            onMapClick={handleMapClick}
            draftLatLng={draftLatLng}
            display={{
              base: mobileView === "map" ? "block" : "none",
              lg: "block",
            }}
          />
        )}

        {/* List pane */}
        <Box
          display={{
            base: mobileView === "list" ? "grid" : "none",
            lg: "grid",
          }}
          gridTemplateRows={{ base: "auto auto auto 1fr", md: "auto auto 1fr" }}
          minH="0"
          bg="nm.paper"
          h="100%"
          overflow="hidden"
          pb={{ base: "70px", md: 0 }}
        >
          <AdminSearchBox
            keyword={keyword}
            onKeywordChange={setKeyword}
            placement="mobile"
          />
          <AdminFilters
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            visitFilter={visitFilter}
            setVisitFilter={setVisitFilter}
            filteredCount={filtered.length}
            totalCount={total}
            onClearAll={() => {
              setCategoryFilter("all");
              setVisitFilter("all");
            }}
          />
          {shops && (
            <Box h="100%" minH="0" overflow="hidden">
              <Box
                display={{ base: "none", md: "block" }}
                h="100%"
                overflow="hidden"
              >
                <AdminTable
                  shops={filtered}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onEdit={handleEdit}
                />
              </Box>
              <Box
                display={{ base: "block", md: "none" }}
                h="100%"
                overflow="hidden"
              >
                <MobileShopList
                  shops={filtered}
                  selectedId={selectedId}
                  onEdit={handleEdit}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Mobile bottom nav */}
      <Box
        as="nav"
        position="fixed"
        bottom="0"
        left="0"
        right="0"
        bg="nm.paper"
        borderTop="1px solid"
        borderTopColor="nm.line"
        display={{ base: "flex", md: "none" }}
        zIndex="700"
        p="6px 8px calc(6px + env(safe-area-inset-bottom))"
      >
        <Button
          variant="plain"
          flex="1"
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap="2px"
          py="8px"
          px="0"
          fontSize="10px"
          fontFamily="mono"
          letterSpacing="0.05em"
          textTransform="uppercase"
          aria-label="リストを表示"
          aria-current={mobileView === "list" ? "page" : undefined}
          color={mobileView === "list" ? "nm.ink" : "nm.inkMuted"}
          _icon={{
            w: "20px",
            h: "20px",
            color: mobileView === "list" ? "nm.shu" : "nm.inkMuted",
          }}
          onClick={() => setMobileView("list")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          リスト
        </Button>
        <Button
          variant="plain"
          flex="0 0 56px"
          w="56px"
          h="56px"
          rounded="full"
          bg="nm.shu"
          color="white"
          display="grid"
          placeItems="center"
          mt="-16px"
          mx="4px"
          boxShadow="0 6px 18px rgba(140, 46, 33, 0.4)"
          _hover={{ bg: "nm.shuDeep" }}
          _icon={{ w: "24px", h: "24px" }}
          onClick={() => setShowAdd(true)}
        >
          <LuPlus />
        </Button>
        <Button
          variant="plain"
          flex="1"
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap="2px"
          py="8px"
          px="0"
          fontSize="10px"
          fontFamily="mono"
          letterSpacing="0.05em"
          textTransform="uppercase"
          aria-label="地図を表示"
          aria-current={mobileView === "map" ? "page" : undefined}
          color={mobileView === "map" ? "nm.ink" : "nm.inkMuted"}
          _icon={{
            w: "20px",
            h: "20px",
            color: mobileView === "map" ? "nm.shu" : "nm.inkMuted",
          }}
          onClick={() => setMobileView("map")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
          地図
        </Button>
      </Box>

      {/* Edit modal */}
      {editShop && (
        <ShopEditModal
          shop={editShop}
          open={!!editId}
          initialTab={editTab}
          onClose={() => setEditId(null)}
          onSave={handleSave}
        />
      )}

      {/* Add modal — mount fresh each time so state resets */}
      {showAdd && (
        <AddModal
          key={draftLatLng ? `${draftLatLng.lat},${draftLatLng.lng}` : "new"}
          open={true}
          onClose={() => {
            setShowAdd(false);
            setDraftLatLng(null);
          }}
          onSave={handleAdd}
          initialLatLng={draftLatLng ?? undefined}
        />
      )}
    </Box>
  );
}
