// Plain Node entry point — deliberately NOT a NestJS application. Temporal
// Activities are invoked directly by the Temporal Worker SDK by name, with
// explicit arguments on every call; there is no HTTP request lifecycle here
// for Nest's DI/guards/interceptors to attach to (see `platform/tenant-db.ts`'s
// header comment for why that's a deliberate simplification, not a gap).
import 'dotenv/config';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './temporal/activities';

async function run() {
  const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'agent-tasks',
    workflowsPath: require.resolve('./temporal/workflows'),
    activities,
  });

  console.log(`agent-orchestrator worker polling task queue "${process.env.TEMPORAL_TASK_QUEUE ?? 'agent-tasks'}"...`);
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
