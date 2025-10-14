import { CSS, render as renderMarkdown } from "@deno/gfm";
import { define } from "@/root.ts";

export default define.page(async (ctx) => {
  try {
    const content = await Deno.readTextFile(
      `${import.meta.dirname}/${ctx.params.id}`,
    );
    const html = renderMarkdown(content);
    return (
      <>
        <div class="min-h-screen min-w-full prose">
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
          <div
            class="dashboard-page"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </>
    );
  } catch (e) {
    console.error(e);
    return (
      <>
        <div>
          404
        </div>
      </>
    );
  }
});
