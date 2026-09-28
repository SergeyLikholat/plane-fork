/**
 * Week board («Неделя») — Sunday planning screen for «Ваша работа».
 *
 * One column of unplanned / overdue work plus seven day columns, each showing
 * the day's total weight against its own limit (use-day-capacity). Cards and whole person groups are
 * dragged between columns to rebalance the week; a drop PATCHes target_date.
 * Data is loaded here directly (see use-week-board-data), not via the
 * profile issue store.
 */
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import type { TIssue } from "@plane/types";
import { Spinner } from "@plane/ui";
import { WORKSPACE_ESTIMATES } from "@/constants/fetch-keys";
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { BigTaskContextProvider } from "@/components/issues/big-task/use-big-task-context";
import { getWeekStart, toPayloadDate } from "../calendar-week/project-root";
import { WeekBoardColumn } from "./board-column";
import type { TColumnDropHandlers } from "./board-column";
import { WeekBoardHeader } from "./board-header";
import type { TProfileViewType } from "./fetch-open-issues";
import { addDays, useBoardModel } from "./use-board-model";
import type { TBoardColumn } from "./use-board-model";
import { RescheduleCountsContext, useRescheduleCounts } from "./reschedule-counts";
import { useDayCapacity } from "./use-day-capacity";
import { useWeekBoardData } from "./use-week-board-data";
import { useWeightBoard } from "./use-weight-board";
import { WeekBoardWeightContext } from "./weight-confirmations";

const DRAG_MIME = "text/plain";

type TDragState = { issueIds: string[]; sourceKey: string };

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

type Props = { viewType: TProfileViewType };

export const WeekBoardLayout = observer(function WeekBoardLayout(props: Props) {
  const { viewType } = props;
  const { workspaceSlug: routeWorkspaceSlug, userId: routeUserId } = useParams();
  const workspaceSlug = routeWorkspaceSlug?.toString();
  const userId = routeUserId?.toString();
  const { isMobile } = usePlatformOS();
  const { handleRedirection } = useIssuePeekOverviewRedirection(false);
  const { peekIssue } = useIssueDetail();
  const { getWorkspaceEstimates } = useProjectEstimates();

  // Estimate points are per project; the profile page spans all projects.
  useSWR(
    workspaceSlug ? WORKSPACE_ESTIMATES(workspaceSlug) : null,
    workspaceSlug ? () => getWorkspaceEstimates(workspaceSlug) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const { issues, hasError, isLoading, refetch, moveIssues, setIssueWeight } = useWeekBoardData(
    workspaceSlug,
    userId,
    viewType
  );

  const today = startOfToday();
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const isCurrentWeek = toPayloadDate(weekStart) === toPayloadDate(getWeekStart(today));
  const dayCapacity = useDayCapacity(workspaceSlug);
  const model = useBoardModel(issues ?? [], weekStart, today, dayCapacity);
  const rescheduleCounts = useRescheduleCounts(workspaceSlug, issues);
  const weightBoard = useWeightBoard(workspaceSlug, issues, model, setIssueWeight);
  const columns: TBoardColumn[] = [model.backlog, ...model.days];
  // Steps of Big tasks get a «↳ 💼 parent» caption: one request for the board.
  const stepIds = (issues ?? []).filter((issue) => issue.parent_id).map((issue) => issue.id);
  const weekTotal = model.days.reduce((acc, d) => acc + d.summary.total, 0);
  const weekLimit = model.days.reduce((acc, d) => acc + (d.limit ?? 0), 0);
  const limitActions = {
    isEditable: dayCapacity.isLoaded,
    setDayLimit: dayCapacity.setDayLimit,
    setWeekdayLimit: dayCapacity.setWeekdayLimit,
    clearDayLimit: dayCapacity.clearDayLimit,
  };

  // Edits made in the peek (estimate, date, state) show up once it closes.
  const wasPeekOpenRef = useRef(false);
  useEffect(() => {
    if (peekIssue) {
      wasPeekOpenRef.current = true;
    } else if (wasPeekOpenRef.current) {
      wasPeekOpenRef.current = false;
      void refetch();
    }
  }, [peekIssue, refetch]);

  // ── drag and drop ──────────────────────────────────────────────────────
  const dragRef = useRef<TDragState | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const canDropOn = (column: TBoardColumn): boolean =>
    Boolean(dragRef.current) && !column.isPast && dragRef.current?.sourceKey !== column.key;

  const handleDragStart = (sourceKey: string) => (issueIds: string[], event: DragEvent<HTMLElement>) => {
    dragRef.current = { issueIds, sourceKey };
    event.dataTransfer.effectAllowed = "move";
    // Firefox refuses to start a drag without data.
    event.dataTransfer.setData(DRAG_MIME, issueIds.join(","));
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setOverKey(null);
  };

  const dropHandlers: Omit<TColumnDropHandlers, "isDropTarget" | "canDrop"> = {
    onDragOver: (column, event) => {
      if (!canDropOn(column)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (overKey !== column.key) setOverKey(column.key);
    },
    onDragLeave: (column, event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      if (overKey === column.key) setOverKey(null);
    },
    onDrop: (column, event) => {
      event.preventDefault();
      const drag = dragRef.current;
      handleDragEnd();
      if (!drag || column.isPast || drag.sourceKey === column.key) return;
      void moveIssues(drag.issueIds, column.targetDate);
    },
  };

  const openIssue = (issue: TIssue) => {
    if (workspaceSlug) handleRedirection(workspaceSlug, issue, isMobile);
  };

  if (isMobile) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-13 text-tertiary">
        Доска «Неделя» работает на компьютере — на телефоне выберите другой вид.
      </div>
    );
  }

  return (
    <RescheduleCountsContext.Provider value={rescheduleCounts}>
      <BigTaskContextProvider workspaceSlug={workspaceSlug} issueIds={stepIds}>
        <WeekBoardWeightContext.Provider value={weightBoard.contextValue}>
          <div className="flex h-full min-h-0 w-full flex-col">
            <WeekBoardHeader
              weekStart={weekStart}
              isCurrentWeek={isCurrentWeek}
              weekTotal={weekTotal}
              weekLimit={weekLimit}
              unconfirmedCount={isLoading ? null : weightBoard.unconfirmedCount}
              isHighlightingUnconfirmed={weightBoard.isHighlightingUnconfirmed}
              onToggleHighlightUnconfirmed={weightBoard.toggleHighlightUnconfirmed}
              onPrev={() => setWeekStart((w) => addDays(w, -7))}
              onToday={() => setWeekStart(getWeekStart(new Date()))}
              onNext={() => setWeekStart((w) => addDays(w, 7))}
            />
            {isLoading ? (
              <div className="grid flex-1 place-items-center">
                <Spinner />
              </div>
            ) : hasError && !issues ? (
              <div className="grid flex-1 place-items-center text-13 text-secondary">
                <div className="text-center">
                  <p>Не удалось загрузить задачи.</p>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="mt-2 rounded-md border border-subtle px-3 py-1 text-12 hover:bg-layer-1-hover"
                  >
                    Повторить
                  </button>
                </div>
              </div>
            ) : (
              // White gaps between the grey column sheets instead of grid lines.
              <div
                className="grid min-h-0 flex-1 gap-1 bg-surface-1 px-1 pt-1"
                style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
              >
                {columns.map((column) => (
                  <WeekBoardColumn
                    key={column.key}
                    column={column}
                    limitActions={limitActions}
                    onOpen={openIssue}
                    onDragStart={handleDragStart(column.key)}
                    onDragEnd={handleDragEnd}
                    isDropTarget={overKey === column.key}
                    canDrop={canDropOn(column)}
                    {...dropHandlers}
                  />
                ))}
              </div>
            )}
          </div>
        </WeekBoardWeightContext.Provider>
      </BigTaskContextProvider>
    </RescheduleCountsContext.Provider>
  );
});
