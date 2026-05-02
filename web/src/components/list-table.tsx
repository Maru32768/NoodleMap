import { useSort } from "@/utils/array.ts";
import { assertNever } from "@/utils/std.ts";
import {
  Box,
  HStack,
  Icon,
  Table,
  TableCellProps,
  Text,
} from "@chakra-ui/react";
import { isFunction, isString } from "es-toolkit";
import React, { forwardRef, useCallback, useMemo } from "react";
import { FaSort, FaSortDown, FaSortUp } from "react-icons/fa";
import { ItemProps, TableProps, TableVirtuoso } from "react-virtuoso";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataType = Record<string, any>;

type ListTableProps<T extends DataType> = {
  data: T[];
  columns: ListTableColumnProps<T>[];
  className?: string;
  emptyMessage?: React.ReactNode;
  getRowProps?: (item: T, index: number) => Table.RowProps;
};

type ListTableContext = {
  getRowProps?: (item: DataType, index: number) => Table.RowProps;
};

export type ListTableColumnProps<T extends DataType> =
  | ListTableColumnPropsWithProperty<T>
  | ListTableColumnPropsWithoutProperty<T>;

type ListTableColumnPropsWithProperty<
  T extends DataType,
  K extends keyof T = keyof T,
> = {
  [P in K]: {
    property: P;
    cellProps?:
      | TableCellProps
      | ((property: T[P], item: T, index: number) => TableCellProps);
    render: (property: T[P], item: T, index: number) => React.ReactNode;
  } & CommonColumnProps;
}[K];

type ListTableColumnPropsWithoutProperty<T extends DataType> = {
  property: undefined;
  cellProps?: TableCellProps | ((item: T, index: number) => TableCellProps);
  render: (item: T, index: number) => React.ReactNode;
} & CommonColumnProps;

type CommonColumnProps = {
  header: React.ReactNode;
  width: Table.ColumnHeaderProps["width"];
  headerProps?: Omit<Table.ColumnHeaderProps, "width">;
};

export function ListTable<T extends DataType>({
  data,
  columns,
  className,
  emptyMessage = "No data",
  getRowProps,
}: ListTableProps<T>) {
  const components = useMemo(
    () => ({
      Table: TableComponent,
      TableHead: Table.Header,
      TableBody: Table.Body,
      TableRow: TableRowComponent,
      TableFoot: Table.Footer,
    }),
    [],
  );

  const context = useMemo<ListTableContext>(
    () => ({
      getRowProps: getRowProps as
        | ((item: DataType, index: number) => Table.RowProps)
        | undefined,
    }),
    [getRowProps],
  );

  if (data.length === 0) {
    return (
      <Box className={className} h="100%" w="100%" bg="nm.paper">
        <Box
          display="grid"
          placeItems="center"
          h="100%"
          minH="10rem"
          px="1.5rem"
          py="2.5rem"
          color="nm.inkFaint"
          fontSize="0.8125rem"
          textAlign="center"
        >
          {emptyMessage}
        </Box>
      </Box>
    );
  }

  return (
    <TableVirtuoso
      className={className}
      style={{
        height: "100%",
        width: "100%",
      }}
      components={components}
      context={context}
      data={data}
      fixedHeaderContent={() => {
        return (
          <Table.Row
            bg="nm.bg"
            borderBottom="1px solid"
            borderColor="nm.lineStrong"
          >
            {columns.map((column, i) => {
              return (
                <Table.ColumnHeader
                  key={i}
                  width={column.width}
                  px="0.625rem"
                  py="0.5rem"
                  textAlign="left"
                  borderRight="none"
                  borderColor="nm.line"
                  color="nm.inkMuted"
                  fontFamily="mono"
                  fontSize="0.625rem"
                  fontWeight="600"
                  letterSpacing="0.15em"
                  textTransform="uppercase"
                  userSelect="none"
                  {...column.headerProps}
                >
                  {column.header}
                </Table.ColumnHeader>
              );
            })}
          </Table.Row>
        );
      }}
      itemContent={(index, data) => {
        return (
          <>
            {columns.map((column, columnIndex) => {
              const commonProps = {
                borderBottom: "1px solid",
                borderColor: "nm.lineFaint",
                bg: "transparent",
                color: "nm.ink",
                fontSize: "0.78125rem",
                lineHeight: "1.45",
                overflow: "hidden",
                px: "0.625rem",
                py: "0.5rem",
                textOverflow: "ellipsis",
                verticalAlign: "middle",
                whiteSpace: "nowrap",
              } satisfies Table.CellProps;

              if (column.property === undefined) {
                const props = column as ListTableColumnPropsWithoutProperty<T>;
                const render = props.render;
                const cellProps = (
                  isFunction(props.cellProps)
                    ? props.cellProps(data, index)
                    : props.cellProps
                ) as TableCellProps;

                return (
                  <Table.Cell key={columnIndex} {...commonProps} {...cellProps}>
                    {render(data, index)}
                  </Table.Cell>
                );
              }

              const props = column as ListTableColumnPropsWithProperty<T>;
              const render = props.render;
              const cellProps = (
                isFunction(props.cellProps)
                  ? props.cellProps(data[column.property], data, index)
                  : props.cellProps
              ) as TableCellProps;

              return (
                <Table.Cell key={columnIndex} {...commonProps} {...cellProps}>
                  {render(data[column.property], data, index)}
                </Table.Cell>
              );
            })}
          </>
        );
      }}
    />
  );
}

export function useSortableListTableHeader<T extends DataType>(
  data: T[],
  initialSortKey?: keyof T,
  initialSortOrder?: "ASC" | "DESC",
) {
  const { sortedData, sortKey, setSortKey, sortOrder, setSortOrder } = useSort(
    data,
    initialSortKey,
    initialSortOrder,
  );

  const createSortableColumn = useCallback(
    ({
      header,
      ...columnProps
    }: ListTableColumnPropsWithProperty<T>): ListTableColumnPropsWithProperty<T> => {
      const sortIcon = (() => {
        if (sortKey !== columnProps.property || !sortOrder) {
          return <FaSort />;
        }

        if (sortOrder === "ASC") {
          return <FaSortDown />;
        }
        return <FaSortUp />;
      })();

      return {
        header: (
          <HStack
            cursor="pointer"
            justifyContent="flex-start"
            gap="0.3125rem"
            color={sortKey === columnProps.property ? "nm.ink" : undefined}
          >
            {isString(header) ? <Text>{header}</Text> : header}
            <Icon
              color={
                sortKey === columnProps.property && sortOrder
                  ? "nm.shu"
                  : "currentColor"
              }
              opacity={sortKey === columnProps.property && sortOrder ? 1 : 0.35}
            >
              {sortIcon}
            </Icon>
          </HStack>
        ),
        ...columnProps,
        headerProps: {
          ...columnProps.headerProps,
          onClick: () => {
            if (sortKey !== columnProps.property) {
              setSortKey(columnProps.property);
              setSortOrder("ASC");
              return;
            }

            switch (sortOrder) {
              case "ASC":
                setSortOrder("DESC");
                return;
              case "DESC":
                setSortOrder(undefined);
                return;
              case undefined:
                setSortOrder("ASC");
                return;
              default:
                throw assertNever(sortOrder);
            }
          },
        },
      };
    },
    [sortKey, sortOrder, setSortKey, setSortOrder],
  );

  return { sortedData, createSortableColumn };
}

const TableComponent = forwardRef<HTMLTableElement, TableProps>(
  function TableComponent({ children, style }, ref) {
    return (
      <Table.Root
        ref={ref}
        style={{
          tableLayout: "fixed",
          borderCollapse: "separate",
          borderSpacing: 0,
          width: "100%",
          ...style,
        }}
      >
        {children}
      </Table.Root>
    );
  },
);

function TableRowComponent({
  item,
  children,
  style,
  context,
  ...props
}: ItemProps<DataType> & { context?: ListTableContext }) {
  const rowProps = context?.getRowProps?.(item, props["data-index"]) ?? {};

  return (
    <Table.Row {...props} {...rowProps} style={{ ...style, ...rowProps.style }}>
      {children}
    </Table.Row>
  );
}
