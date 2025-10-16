import { define } from "@/root.ts";
import quant from "@/db/quant.ts";
import { isAdmin, isAdminOn } from "@/db/rbac.ts";
import {
  GetApiEventSourcesResponse,
  GetApiReportsResponse,
} from "@/quant/http/client.ts";

import AdminToggle from "@/components/AdminToggle.tsx";
import Modal from "@/islands/Modal.tsx";
import { AddReportForm } from "@/islands/reports/AddReportForm.tsx";
import BookTextIcon from "lucide-react/dist/esm/icons/book-text.js";

type Report = GetApiReportsResponse[200];

export const handler = define.handlers({
  async GET(ctx) {
    const { state } = ctx;
    const adminOn = isAdminOn(ctx);
    const query = {
      owners: adminOn ? undefined : state.user?._id.toString(),
    };
    const { data: reports, error: error1 } = await quant.getApiReports({
      query,
    });
    const { data: sources, error: error2 } = await quant.getApiEventSources({
      query,
    });
    if (error1 || error2) {
      return new Response(((error1 || error2) as any).error, { status: 400 });
    }
    return { data: { reports, sources, adminOn, isAdmin: isAdmin(ctx) } };
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const description = form.get("description") as string;
    const { user } = ctx.state;
    if (!user) {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { data: report, error } = await quant.postApiReports({
      body: {
        name,
        description,
      },
    });

    if (error) {
      return new Response((error as any).error, { status: 400 });
    }

    return Response.json(report);
  },
});

export default define.page((props) => {
  const { reports, sources, adminOn, isAdmin } = props.data as {
    reports: Report[];
    sources: GetApiEventSourcesResponse;
    isAdmin: boolean;
    adminOn: boolean;
  };
  return (
    <div class="dashboard-page">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-2xl font-bold">Reports</h1>
        <div class="flex gap-2">
          <AdminToggle {...{ isAdmin, adminOn }} />
          <a class="btn" href="/app/user-docs/reports.md">
            <BookTextIcon />
          </a>
          <Modal
            id="create-new-report"
            title="Create New Report"
            triggerClass="btn btn-primary"
            trigger="Create New Report"
          >
            <AddReportForm data={{ reports, sources }} />
          </Modal>
        </div>
      </div>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <div key={report.id} class="card bg-base-200 shadow-md">
            <div class="card-body">
              <h2 class="card-title">{report.name}</h2>
              <p>{report.description}</p>
              <div class="card-actions grid grid-cols-3 mt-4">
                <a
                  href={`/app/reports/${report.id}/metrics`}
                  class="btn btn-sm btn-outline"
                >
                  Metrics
                </a>
                <a
                  href={`/app/reports/${report.id}/aggregations`}
                  class="btn btn-sm btn-outline"
                >
                  Aggregations
                </a>
                <a
                  href={`/app/reports/${report.id}/settings`}
                  class="btn btn-sm btn-outline btn-primary"
                >
                  Settings
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
