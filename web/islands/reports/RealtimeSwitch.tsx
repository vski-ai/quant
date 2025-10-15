import { isRealtime } from "./store.ts";

export const RealtimeSwitch = () => {
  const store = isRealtime.use(false);

  return (
    <div class="flex items-center relative">
      <label class="label cursor-pointer gap-2 text-center flex flex-col">
        <input
          type="checkbox"
          class="toggle toggle-primary"
          checked={store.value}
          onChange={(e) => {
            store.value = e.currentTarget.checked;
          }}
        />
        {/* <span class="label-text text-xs w-full absolute top-7">Realtime</span> */}
      </label>
    </div>
  );
};
