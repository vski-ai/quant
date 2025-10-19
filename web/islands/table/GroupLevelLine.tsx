export const GroupLevelLine = (
  { level, height }: { level: number; height: number },
) => {
  return new Array(level).fill(0).map((_, i) => (
    <span
      key={i}
      style={{
        marginLeft: ((level - i) * 14) + 1 + "px",
        height: height + "px",
      }}
      class="absolute -top-6 left-3  border-l-1 border-dashed dark:opacity-50"
    >
    </span>
  ));
};

export const GroupLinePointer = (
  { level, height }: { level: number; height: number },
) => {
  return (
    <span
      class="border-b-1 border-dashed absolute left-0 dark:opacity-50"
      style={{
        top: (height / 2 + 2) + "px",
        marginLeft: (1 * (level ?? 0)) + 1 + "em",
        width: (0.7 * level) + "em",
      }}
    >
    </span>
  );
};
