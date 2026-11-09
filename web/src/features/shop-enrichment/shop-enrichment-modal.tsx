import {
  FileButton,
  outlineButton,
  primaryButton,
} from "@/components/file-button.tsx";
import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import {
  SegmentedOption,
  SegmentedPicker,
} from "@/components/segmented-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Shop,
  Tag,
  useShops,
  useTags,
} from "@/features/shops/api/use-shops.ts";
import { BusinessHoursEditor } from "@/features/shops/business-hours-editor.tsx";
import {
  BusinessHours,
  businessHoursText,
} from "@/features/shops/business-hours.ts";
import { SHOP_LINK_TYPE_LABEL } from "@/features/shops/shop-links.ts";
import { Box, Input, NativeSelect } from "@chakra-ui/react";
import { groupBy } from "es-toolkit";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { LuFileCheck } from "react-icons/lu";
import type {
  ClosureValue,
  EnrichmentFile,
  Evidence,
  NoticeKind,
  Proposal,
  ProposalField,
  ReviewReason,
  SourceKind,
} from "./proposal-file.ts";
import { parseEnrichmentFile } from "./proposal-file.ts";
import {
  canBulkApprove,
  currentValueOf,
  editProblem,
  ProposalState,
  stateOf,
} from "./review.ts";
import { ApplyOutcome, ApplyProgress, applyProposals } from "./run-apply.ts";

const FILE_ACCEPT = ".jsonl,application/x-ndjson,text/plain";

const FIELD_LABELS: Record<ProposalField, string> = {
  name: "店名",
  name_kana: "読み",
  opened_at: "開店日",
  closed_at: "閉店日",
  temporary_closure: "臨時休業",
  business_hours: "営業時間",
  link: "リンク",
  tag: "タグ",
};

const REASON_LABELS: Record<ReviewReason, string> = {
  high_impact_field: "影響の大きい項目",
  replaces_existing_value: "既存の値を置き換え",
  link_needs_review: "リンクの確認が必要",
  source_unconfirmed: "出典の確認が必要",
  estimated_reading: "推定の読み",
  suspected_injection: "注入の疑い",
  identity_uncertain: "店舗の同定が不確か",
};

const SOURCE_LABELS: Record<SourceKind, string> = {
  official_site: "公式サイト",
  official_sns: "公式SNS",
  facility_site: "施設のテナントページ",
  tabelog: "食べログ",
  reservation_site: "予約サイト",
};

const NOTICE_LABELS: Record<NoticeKind, string> = {
  address_differs: "住所が異なる",
  possibly_relocated: "移転の可能性",
  possibly_closed: "閉店の可能性",
  closed_without_date: "閉店 (日付不明)",
  multiple_candidates: "候補が複数",
  suspected_injection: "注入の疑い",
};

type StateFilter = "open" | "bulk" | "review" | "conflict" | "applied";
type Row = { readonly proposal: Proposal; readonly state: ProposalState };
type Filters = {
  readonly state: StateFilter;
  readonly field: ProposalField | "all";
  readonly reason: ReviewReason | "all";
  readonly source: SourceKind | "all";
};
type RunState =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly progress: ApplyProgress }
  | { readonly kind: "done"; readonly outcome: ApplyOutcome };

const INITIAL_FILTERS: Filters = {
  state: "open",
  field: "all",
  reason: "all",
  source: "all",
};

const matchesState = (row: Row, filter: StateFilter) => {
  switch (filter) {
    case "open":
      return row.state.kind !== "applied";
    case "bulk":
      return canBulkApprove(row.proposal, row.state);
    case "review":
      return (
        row.state.kind === "ready" && !canBulkApprove(row.proposal, row.state)
      );
    case "conflict":
      return row.state.kind === "conflict";
    case "applied":
      return row.state.kind === "applied";
  }
};

const matchesFilters = (row: Row, filters: Filters) =>
  matchesState(row, filters.state) &&
  (filters.field === "all" || row.proposal.field === filters.field) &&
  (filters.reason === "all" ||
    row.proposal.reviewReasons.includes(filters.reason)) &&
  (filters.source === "all" ||
    row.proposal.evidence.some((e) => e.sourceKind === filters.source));

const selectable = ({ state }: Row) =>
  state.kind === "ready" || state.kind === "conflict";

const closureText = (value: ClosureValue) =>
  `${value.startsOn} から ${value.reopensOn ? `${value.reopensOn} に再開` : "再開未定"}`;

const textOf = (value: string | ClosureValue | BusinessHours | null) =>
  value === null
    ? "未設定"
    : typeof value === "string"
      ? value
      : "kind" in value
        ? businessHoursText(value)
        : closureText(value);

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Applies a research batch's `accepted.jsonl`: reads the file in the browser, compares every proposal
 * with production, and saves only what the admin chose. The file never reaches the server, and all of
 * its text comes from the web, so it renders as plain text. Closing is refused while a run is going.
 */
export function ShopEnrichmentModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { shops, mutate: mutateShops } = useShops();
  const { tags, mutate: mutateTags } = useTags();
  const [file, setFile] = useState<EnrichmentFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [edits, setEdits] = useState<Readonly<Record<string, Proposal>>>({});
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);
  const running = run.kind === "running";

  useEffect(() => {
    if (!running) {
      return;
    }
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const shopsById = useMemo(
    () => new Map((shops ?? []).map((shop) => [shop.id, shop])),
    [shops],
  );
  const rows = useMemo<readonly Row[]>(
    () =>
      (file?.proposals ?? []).map((proposal) => ({
        proposal,
        state: stateOf(proposal, shopsById.get(proposal.shopId), tags ?? []),
      })),
    [file, shopsById, tags],
  );
  const visible = rows.filter((row) => matchesFilters(row, filters));
  const rowsByShop = groupBy(visible, (row) => row.proposal.shopId);
  // A notice can stand alone, as when a shop closed with no date to propose, and it outlasts the
  // shop's proposals. It stays in the view that claims to show everything still open.
  const showsEveryNotice =
    filters.state === "open" &&
    filters.field === "all" &&
    filters.reason === "all" &&
    filters.source === "all";
  const noticeShopIds = (file?.notices ?? []).map((notice) => notice.shopId);
  const shopIds = [
    ...new Set([
      ...Object.keys(rowsByShop),
      ...(showsEveryNotice ? noticeShopIds : []),
    ]),
  ];
  const chosen = rows.filter(
    (row) => selectable(row) && selected.has(row.proposal.id),
  );
  const invalidEdit = chosen.some((row) => {
    const edit = edits[row.proposal.id];
    return edit !== undefined && editProblem(edit) !== null;
  });

  const count = (filter: StateFilter) =>
    rows.filter((row) => matchesState(row, filter)).length;
  const stateOptions: readonly SegmentedOption<StateFilter>[] = [
    { id: "open", label: `未適用 (${count("open")})` },
    { id: "bulk", label: `一括可 (${count("bulk")})` },
    { id: "review", label: `要確認 (${count("review")})` },
    { id: "conflict", label: `食い違い (${count("conflict")})` },
    { id: "applied", label: `適用済み (${count("applied")})` },
  ];

  const refresh = () => Promise.all([mutateShops(), mutateTags()]);

  const load = async (picked: File) => {
    const parsed = parseEnrichmentFile(await picked.text());
    if (!parsed.ok) {
      // A loaded review stays, with its selections and edits: picking the wrong file costs nothing.
      setFileError(parsed.error);
      return;
    }
    // The admin page's cache can be hours old, and every state below compares with production.
    await refresh();
    setFileError(null);
    setFile(parsed.data);
    setSelected(new Set());
    setEdits({});
    setFilters(INITIAL_FILTERS);
    setRun({ kind: "idle" });
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  const selectBulk = () =>
    setSelected(
      (current) =>
        new Set([
          ...current,
          ...visible
            .filter((row) => canBulkApprove(row.proposal, row.state))
            .map((row) => row.proposal.id),
        ]),
    );

  const apply = async () => {
    const controller = new AbortController();
    abort.current = controller;
    const outcome = await applyProposals(
      chosen.map((row) => ({
        proposal: edits[row.proposal.id] ?? row.proposal,
        seenCurrent: currentValueOf(
          row.proposal,
          shopsById.get(row.proposal.shopId)!,
        ),
      })),
      {
        signal: controller.signal,
        onProgress: (progress) => setRun({ kind: "running", progress }),
      },
    );
    setRun({ kind: "done", outcome });
    // A choice answers what was on screen. A refused row may now read differently, so it must be chosen again.
    setSelected(new Set());
    await refresh();
  };

  const close = () => {
    if (!running) {
      onClose();
    }
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && close()}
      width="100%"
      maxWidth="1100px"
      height="90vh"
      title="調査結果の取り込み"
      subtitle="SHOP RESEARCH"
      icon={<LuFileCheck size={18} />}
      iconBg="nm.ink"
      showCloseButton={!running}
      bodyProps={{ display: "flex", flexDirection: "column", gap: "12px" }}
    >
      {!file ? (
        <Box
          display="grid"
          placeItems="center"
          gap="12px"
          py="48px"
          border="1px dashed"
          borderColor="nm.line"
          rounded="nmLg"
          textAlign="center"
        >
          <Box fontSize="13px" color="nm.inkMuted" lineHeight="1.8">
            validate-results.mjs が出力した accepted.jsonl を選んでください。
            <br />
            本番の値と比べて表示します。選んだ項目を反映するまで、店舗は変わりません。
          </Box>
          <FileButton
            {...primaryButton}
            accept={FILE_ACCEPT}
            disabled={!shops || !tags}
            onFiles={([picked]) => void load(picked)}
          >
            ファイルを選ぶ
          </FileButton>
          {fileError && (
            <Box role="alert" fontSize="13px" color="nm.shuDeep">
              読み込めませんでした。{fileError}
            </Box>
          )}
        </Box>
      ) : (
        <>
          <Box
            display="grid"
            gap="6px"
            p="12px"
            bg="nm.bg"
            border="1px solid"
            borderColor="nm.lineFaint"
            rounded="nmMd"
            flexShrink={0}
          >
            <Line>
              {file.runId} · 提案 {rows.length} 件 · 調査済み: 発見{" "}
              {file.checks.found} / 情報なし {file.checks.no_evidence} / 失敗{" "}
              {file.checks.error}
            </Line>
            {file.tagCandidates.length > 0 && (
              <Line muted>
                タグの候補:{" "}
                {file.tagCandidates
                  .map(({ label, count: n }) => `${label} (${n})`)
                  .join("、")}
              </Line>
            )}
            {noticeShopIds.length > 0 && (
              <Line muted>
                注意のある店舗: {new Set(noticeShopIds).size} 店
              </Line>
            )}
            <RunSummary run={run} />
            {fileError && (
              <Box role="alert" fontSize="13px" color="nm.shuDeep">
                読み込めませんでした。{fileError}
              </Box>
            )}
            <Box
              display="flex"
              justifyContent="flex-end"
              alignItems="center"
              gap="8px"
              flexWrap="wrap"
            >
              {running ? (
                <Button
                  {...outlineButton}
                  onClick={() => abort.current?.abort()}
                >
                  停止
                </Button>
              ) : (
                <>
                  <FileButton
                    {...outlineButton}
                    accept={FILE_ACCEPT}
                    onFiles={([picked]) => void load(picked)}
                  >
                    別のファイルを選ぶ
                  </FileButton>
                  <Button {...outlineButton} onClick={selectBulk}>
                    表示中の一括可を選択
                  </Button>
                  <Button
                    {...outlineButton}
                    disabled={selected.size === 0}
                    onClick={() => setSelected(new Set())}
                  >
                    選択を解除
                  </Button>
                </>
              )}
              <LoadableButton
                {...primaryButton}
                disabled={chosen.length === 0 || invalidEdit}
                onClick={apply}
              >
                選択した {chosen.length} 件を本番へ反映
              </LoadableButton>
            </Box>
          </Box>

          <Box display="flex" gap="8px" flexWrap="wrap" flexShrink={0}>
            <SegmentedPicker
              variant="segment"
              label="状態"
              options={stateOptions}
              value={filters.state}
              onChange={(state) => setFilters((f) => ({ ...f, state }))}
            />
            <FilterSelect
              label="項目"
              value={filters.field}
              options={FIELD_LABELS}
              onChange={(field) => setFilters((f) => ({ ...f, field }))}
            />
            <FilterSelect
              label="確認理由"
              value={filters.reason}
              options={REASON_LABELS}
              onChange={(reason) => setFilters((f) => ({ ...f, reason }))}
            />
            <FilterSelect
              label="証拠"
              value={filters.source}
              options={SOURCE_LABELS}
              onChange={(source) => setFilters((f) => ({ ...f, source }))}
            />
          </Box>

          <Box
            flex="1"
            minH="0"
            overflowY="auto"
            display="grid"
            gap="10px"
            alignContent="start"
          >
            {shopIds.length === 0 && (
              <Box
                fontSize="13px"
                color="nm.inkMuted"
                py="24px"
                textAlign="center"
              >
                該当する提案はありません
              </Box>
            )}
            {shopIds.map((shopId) => (
              <ShopGroup
                key={shopId}
                shop={shopsById.get(shopId)}
                shopId={shopId}
                notices={file.notices.filter((n) => n.shopId === shopId)}
              >
                {(rowsByShop[shopId] ?? []).map((row) => (
                  <ProposalRow
                    key={row.proposal.id}
                    row={row}
                    shop={shopsById.get(shopId)}
                    tags={tags ?? []}
                    readOnly={running}
                    checked={selected.has(row.proposal.id)}
                    onCheck={(on) => toggle(row.proposal.id, on)}
                    edit={edits[row.proposal.id]}
                    onEdit={(edit) => {
                      setEdits((current) => {
                        const next = { ...current };
                        if (edit) {
                          next[row.proposal.id] = edit;
                        } else {
                          delete next[row.proposal.id];
                        }
                        return next;
                      });
                      // Starting an edit chooses it and stopping takes that back. A keystroke leaves the choice alone.
                      if (
                        edit === undefined ||
                        edits[row.proposal.id] === undefined
                      ) {
                        toggle(row.proposal.id, edit !== undefined);
                      }
                    }}
                  />
                ))}
              </ShopGroup>
            ))}
          </Box>
        </>
      )}
    </ModalDialog>
  );
}

function RunSummary({ run }: { run: RunState }) {
  if (run.kind === "idle") {
    return null;
  }
  const progress = run.kind === "running" ? run.progress : run.outcome.progress;
  const title =
    run.kind === "running"
      ? "反映しています"
      : run.outcome.kind === "finished"
        ? "反映が終わりました"
        : run.outcome.kind === "stopped"
          ? "反映を停止しました"
          : "ログインが切れたため停止しました。ログインし直してから、もう一度反映してください";
  return (
    <>
      <Line>{title}</Line>
      <Line>
        店舗 {progress.shopsDone} / {progress.shopsTotal} · 反映{" "}
        {progress.applied} 件 · 適用済み {progress.alreadyApplied} 件 · 失敗{" "}
        {progress.failures.length} 件
      </Line>
      {progress.failures.length > 0 && run.kind === "done" && (
        <Line muted>反映するには、もう一度選んでください。</Line>
      )}
      {progress.failures.length > 0 && (
        <Box
          as="ul"
          aria-label="反映できなかった項目"
          maxH="120px"
          overflowY="auto"
          fontSize="12px"
          color="nm.shuDeep"
          pl="16px"
        >
          {progress.failures.map((failure, i) => (
            <li key={i}>
              {failure.shopName && `${failure.shopName}: `}
              {failure.message}
            </li>
          ))}
        </Box>
      )}
    </>
  );
}

function ShopGroup({
  shop,
  shopId,
  notices,
  children,
}: {
  shop: Shop | undefined;
  shopId: string;
  notices: EnrichmentFile["notices"];
  children: ReactNode;
}) {
  const name = shop?.name ?? `本番にない店舗 (${shopId})`;
  return (
    <Box
      role="group"
      aria-label={name}
      border="1px solid"
      borderColor="nm.line"
      rounded="nmMd"
      p="12px"
      display="grid"
      gap="8px"
    >
      <Box>
        <Box fontSize="14px" fontWeight={600}>
          {name}
        </Box>
        {shop && (
          <Box fontSize="12px" color="nm.inkMuted">
            {shop.address}
          </Box>
        )}
      </Box>
      {notices.map((notice, i) => (
        <Box key={i} fontSize="12px" color="nm.shuDeep">
          {NOTICE_LABELS[notice.kind]}: {notice.note}
          {notice.url && (
            <>
              {" "}
              <ExternalLink url={notice.url}>{hostOf(notice.url)}</ExternalLink>
            </>
          )}
        </Box>
      ))}
      {children}
    </Box>
  );
}

function ProposalRow({
  row,
  shop,
  tags,
  readOnly,
  checked,
  onCheck,
  edit,
  onEdit,
}: {
  row: Row;
  shop: Shop | undefined;
  tags: readonly Tag[];
  readOnly: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
  edit: Proposal | undefined;
  onEdit: (edit: Proposal | undefined) => void;
}) {
  const { proposal, state } = row;
  const label = fieldLabel(proposal);
  const editing = edit !== undefined;
  const problem = edit && editProblem(edit);
  return (
    <Box
      role="group"
      aria-label={label}
      display="grid"
      gridTemplateColumns="24px 1fr"
      gap="8px"
      py="8px"
      borderTop="1px solid"
      borderTopColor="nm.lineFaint"
    >
      {selectable(row) ? (
        <Checkbox
          size="sm"
          checked={checked}
          disabled={readOnly}
          onCheckedChange={(e) => onCheck(e.checked === true)}
          inputProps={{ "aria-label": `${label}を選択` }}
        />
      ) : (
        <Box />
      )}
      <Box display="grid" gap="4px" minW="0">
        <Box
          display="flex"
          gap="6px"
          flexWrap="wrap"
          alignItems="center"
          fontSize="13px"
        >
          <Box fontWeight={600}>{label}</Box>
          <StateBadge proposal={proposal} state={state} />
          {proposal.reviewReasons.map((reason) => (
            <Badge key={reason}>{REASON_LABELS[reason]}</Badge>
          ))}
        </Box>
        {shop &&
          proposal.field !== "tag" &&
          (proposal.field !== "link" || state.kind === "conflict") && (
            <Value label="現在">{textOf(currentValueOf(proposal, shop))}</Value>
          )}
        {state.kind === "conflict" && proposal.field !== "link" && (
          <Value label="調査時">{textOf(proposal.baseValue)}</Value>
        )}
        {editing ? (
          <ValueEditor proposal={edit} onChange={onEdit} problem={problem} />
        ) : (
          <Value label="提案">
            <ProposedValue proposal={proposal} tags={tags} />
          </Value>
        )}
        {proposal.estimated && (
          <Box fontSize="12px" color="nm.inkMuted">
            情報源のない推定です
          </Box>
        )}
        <Box
          as="ul"
          display="grid"
          gap="2px"
          fontSize="12px"
          color="nm.inkMuted"
        >
          {proposal.evidence.map((item, i) => (
            <EvidenceItem key={i} evidence={item} />
          ))}
        </Box>
        {selectable(row) && proposal.field !== "tag" && !readOnly && (
          <Box>
            <Button
              variant="plain"
              h="auto"
              minH="auto"
              p="0"
              fontSize="12px"
              textDecoration="underline"
              color="nm.inkMuted"
              onClick={() => onEdit(editing ? undefined : proposal)}
            >
              {editing ? "修正をやめる" : "修正する"}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

const fieldLabel = (proposal: Proposal) =>
  proposal.field === "link"
    ? `リンク: ${SHOP_LINK_TYPE_LABEL[proposal.proposedValue.type]}`
    : FIELD_LABELS[proposal.field];

function ProposedValue({
  proposal,
  tags,
}: {
  proposal: Proposal;
  tags: readonly Tag[];
}) {
  switch (proposal.field) {
    case "link": {
      const { url, label } = proposal.proposedValue;
      return (
        <>
          {label && `${label} `}
          <ExternalLink url={url}>{url}</ExternalLink>
        </>
      );
    }
    case "tag":
      return (
        <>
          {tags.find((tag) => tag.slug === proposal.proposedValue)?.label ??
            proposal.proposedValue}
        </>
      );
    case "name":
    case "name_kana":
    case "opened_at":
    case "closed_at":
    case "temporary_closure":
    case "business_hours":
      return <>{textOf(proposal.proposedValue)}</>;
  }
}

function ValueEditor({
  proposal,
  onChange,
  problem,
}: {
  proposal: Proposal;
  onChange: (edit: Proposal) => void;
  problem: string | null | undefined;
}) {
  const label = `${fieldLabel(proposal)}の修正`;
  let inputs: ReactNode;
  switch (proposal.field) {
    case "business_hours":
      inputs = (
        <BusinessHoursEditor
          value={proposal.proposedValue}
          stampToday={false}
          // 不明 is no proposal, so that choice is ignored here.
          onChange={(hours) =>
            hours &&
            onChange({
              ...proposal,
              proposedValue: {
                ...hours,
                checkedOn: hours.checkedOn ?? proposal.proposedValue.checkedOn,
              },
            })
          }
        />
      );
      break;
    case "temporary_closure": {
      const value = proposal.proposedValue;
      inputs = (
        <Box display="flex" gap="6px">
          <Input
            size="sm"
            type="date"
            aria-label={`${label} 開始日`}
            value={value.startsOn}
            onChange={(e) =>
              onChange({
                ...proposal,
                proposedValue: { ...value, startsOn: e.target.value },
              })
            }
          />
          <Input
            size="sm"
            type="date"
            aria-label={`${label} 再開日`}
            value={value.reopensOn ?? ""}
            onChange={(e) =>
              onChange({
                ...proposal,
                proposedValue: { ...value, reopensOn: e.target.value || null },
              })
            }
          />
        </Box>
      );
      break;
    }
    case "link":
      inputs = (
        <Input
          size="sm"
          aria-label={label}
          value={proposal.proposedValue.url}
          onChange={(e) =>
            onChange({
              ...proposal,
              proposedValue: { ...proposal.proposedValue, url: e.target.value },
            })
          }
        />
      );
      break;
    case "tag":
      inputs = null;
      break;
    case "name":
    case "name_kana":
    case "opened_at":
    case "closed_at":
      inputs = (
        <Input
          size="sm"
          type={
            proposal.field === "opened_at" || proposal.field === "closed_at"
              ? "date"
              : "text"
          }
          aria-label={label}
          value={proposal.proposedValue}
          onChange={(e) =>
            onChange({ ...proposal, proposedValue: e.target.value })
          }
        />
      );
  }
  return (
    <Box display="grid" gap="4px">
      {inputs}
      {problem && (
        <Box role="alert" fontSize="12px" color="nm.shuDeep">
          {problem}
        </Box>
      )}
    </Box>
  );
}

function EvidenceItem({ evidence }: { evidence: Evidence }) {
  return (
    <li>
      {SOURCE_LABELS[evidence.sourceKind]} · {evidence.observedAt} ·{" "}
      {evidence.note} ·{" "}
      <ExternalLink url={evidence.url}>{hostOf(evidence.url)}</ExternalLink>
    </li>
  );
}

// Only parsed http(s) URLs reach this, and the page is never loaded on its own.
function ExternalLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <Box
      as="a"
      textDecoration="underline"
      wordBreak="break-all"
      {...{ href: url, target: "_blank", rel: "noopener noreferrer" }}
    >
      {children}
    </Box>
  );
}

function StateBadge({
  proposal,
  state,
}: {
  proposal: Proposal;
  state: ProposalState;
}) {
  switch (state.kind) {
    case "ready":
      return null;
    case "applied":
      return <Badge>適用済み</Badge>;
    case "conflict":
      return (
        <Badge tone="alert">
          {proposal.field === "link"
            ? "同じ種類のリンクがあります"
            : "本番の値が調査時と違う"}
        </Badge>
      );
    case "unavailable":
      return (
        <Badge tone="alert">
          {state.reason === "shop_missing"
            ? "本番に店舗がありません"
            : "本番にタグがありません"}
        </Badge>
      );
  }
}

function Badge({ children, tone }: { children: ReactNode; tone?: "alert" }) {
  return (
    <Box
      as="span"
      fontSize="11px"
      px="6px"
      py="1px"
      rounded="4px"
      border="1px solid"
      borderColor={tone === "alert" ? "nm.shu" : "nm.line"}
      color={tone === "alert" ? "nm.shuDeep" : "nm.inkMuted"}
    >
      {children}
    </Box>
  );
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box display="grid" gridTemplateColumns="48px 1fr" fontSize="13px">
      <Box color="nm.inkMuted">{label}</Box>
      <Box minW="0" wordBreak="break-word" whiteSpace="pre-line">
        {children}
      </Box>
    </Box>
  );
}

function Line({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Box fontSize="13px" color={muted ? "nm.inkMuted" : "nm.ink"}>
      {children}
    </Box>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "all";
  options: Readonly<Record<T, string>>;
  onChange: (value: T | "all") => void;
}) {
  return (
    <NativeSelect.Root width="auto" size="sm">
      <NativeSelect.Field
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T | "all")}
      >
        <option value="all">{label}: すべて</option>
        {(Object.entries(options) as [T, string][]).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}
