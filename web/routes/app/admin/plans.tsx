import { define } from "@/root.ts";
import { Head } from "fresh/runtime";
import { PageProps } from "fresh";
import { connectMongo } from "@/db/mongo.ts";
import { Plan } from "@/db/models.ts";

export const handler = define.handlers({
  async GET(_ctx) {
    const db = await connectMongo();
    const Plans = db.collection<Plan>("plans");
    const plans = await Plans.find({}).toArray();
    return { data: { plans } };
  },
});

export default define.page(function AdminPlansPage({ data }: PageProps) {
  const { plans } = data as any;

  return (
    <div class="p-4 md:p-8">
      <Head>
        <title>Admin | Plans</title>
      </Head>
      <div class="max-w-screen-md">
        <h1 class="text-4xl font-bold">Manage Plans</h1>

        <div class="mt-8">
          <h2 class="text-2xl font-bold">Create New Plan</h2>
          <form method="POST" action="/api/admin/plans" class="mt-4 space-y-4">
            <input
              name="name"
              placeholder="Plan Name"
              class="input input-bordered w-full"
              required
            />
            <input
              name="requestsPerDay"
              type="number"
              placeholder="Requests per Day"
              class="input input-bordered w-full"
              required
            />
            <input
              name="requestsPerSecond"
              type="number"
              placeholder="Requests per Second"
              class="input input-bordered w-full"
              required
            />
            <input
              name="totalRequests"
              type="number"
              placeholder="Total Requests"
              class="input input-bordered w-full"
              required
            />
            <button type="submit" class="btn btn-primary">Create Plan</button>
          </form>
        </div>

        <div class="mt-8">
          <h2 class="text-2xl font-bold">Existing Plans</h2>
          <div class="overflow-x-auto">
            <table class="table w-full mt-4">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Requests per Day</th>
                  <th>Requests per Second</th>
                  <th>Total Requests</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan: any) => (
                  <tr key={plan._id.toString()}>
                    <td>{plan.name}</td>
                    <td>{plan.quotas.requestsPerDay}</td>
                    <td>{plan.quotas.requestsPerSecond}</td>
                    <td>{plan.quotas.totalRequests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
});
