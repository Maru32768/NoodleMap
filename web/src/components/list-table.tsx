import { HStack, Icon, Table, TableCellProps, Text } from "@chakra-ui/react";
import React, { forwardRef, useCallback } from "react";
import { TableProps, TableVirtuoso } from "react-virtuoso";
import { useSort } from "@/utils/array.ts";
import { FaSort, FaSortDown, FaSortUp } from "react-icons/fa";
import { assertNever } from "@/utils/std.ts";
import { isFunction, isString } from "es-toolkit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataType = Record<string, any>;

type ListTableProps<T extends DataType> = {
  data: T[];
  columns: ListTableColumnProps<T>[];
};

type ListTableColumnProps<T extends DataType> =
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
}: ListTableProps<T>) {
  return (
    <TableVirtuoso
      style={{
        height: "100%",
        width: "100%",
      }}
      components={{
        Table: TableComponent,
        TableHead: Table.Header,
        TableBody: Table.Body,
        TableRow: Table.Row,
        TableFoot: Table.Footer,
      }}
      data={data}
      fixedHeaderContent={() => {
        return (
          <Table.Row bg="gray.100" borderY="1px solid" borderColor="gray">
            {columns.map((column, i) => {
              return (
                <Table.ColumnHeader
                  key={i}
                  width={column.width}
                  textAlign="center"
                  borderLeft={i === 0 ? "1px solid" : undefined}
                  borderRight="1px solid"
                  borderColor="gray"
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
                borderLeft: columnIndex === 0 ? "1px solid" : undefined,
                borderRight: "1px solid",
                borderBottom: "1px solid",
                borderColor: "gray",
                bg: index % 2 === 0 ? "white" : "gray.50",
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

export function useSortableListTableHeader<T extends DataType>(data: T[]) {
  const { sortedData, sortKey, setSortKey, sortOrder, setSortOrder } =
    useSort(data);

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
          <HStack cursor="pointer" justifyContent="center">
            {isString(header) ? <Text>{header}</Text> : header}
            <Icon>{sortIcon}</Icon>
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
          width: "auto",
          ...style,
        }}
      >
        {children}
      </Table.Root>
    );
  },
);
