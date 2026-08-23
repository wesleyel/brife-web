import type { BasesEntry, BasesView } from "@quartz-community/bases-page/types";
/** 客户端筛选控件的类型。服务端推断一次，写进 JSON 载荷。 */
export type PropKind = "text" | "list" | "number" | "date" | "bool";
export interface PropDescriptor {
    /** Bases 属性路径，如 "卷子" / "file.mtime" / "formula.x" */
    key: string;
    label: string;
    kind: PropKind;
    /** 是否在右侧栏出现为筛选控件 */
    facet: boolean;
    /** 是否可作为排序键 */
    sortable: boolean;
}
/** bases-page 内部用 EvalContext 取值，这里从 entry 还原一个出来。 */
export declare function entryContext(entry: BasesEntry): {
    note: Record<string, unknown>;
    file: {
        properties: Record<string, unknown>;
        name: string;
        basename: string;
        path: string;
        folder: string;
        ext: string;
        tags: string[];
        links: string[];
        embeds?: string[];
        created?: string | Date;
        modified?: string | Date;
        ctime?: Date;
        mtime?: Date;
        size?: number;
    };
    formula: Record<string, unknown>;
};
export declare function readProp(entry: BasesEntry, key: string): unknown;
export declare function propLabel(key: string, configured?: string): string;
/**
 * 从实际数据推断属性类型，而不是信 frontmatter 的声明——
 * vault 里同一个字段在不同题里可能一会儿是字符串一会儿是数组。
 * 取众数，list 优先（只要出现过数组就当多值处理）。
 */
export declare function inferKind(entries: BasesEntry[], key: string): PropKind;
/** 唯一值个数——用来判断一个属性适不适合做 facet（枚举太多就没意义） */
export declare function distinctCount(entries: BasesEntry[], key: string): number;
/**
 * 决定右侧栏出现哪些控件。
 * 优先用 .base 里显式写的 `facets:`；没写就从 view.order 里挑：
 * 数值/日期一律可筛，文本/多值要求唯一值 ≤ 40（再多就是自由文本，筛不动）。
 */
export declare function buildDescriptors(entries: BasesEntry[], view: BasesView, propertyLabels?: Record<string, {
    displayName?: string;
}>): PropDescriptor[];
/** 序列化成客户端能直接比较的值：Date → ISO，其余原样 */
export declare function serializeValue(v: unknown): unknown;
