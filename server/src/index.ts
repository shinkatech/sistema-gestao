import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { startBackupSchedule } from "./backup";
import { initDatabase } from "./db";
import { HttpError } from "./http";
import { clientsRouter } from "./routes/clients";
import { payablesRouter, receivablesRouter } from "./routes/finance";
import { reportsRouter } from "./routes/reports";
import { serviceOrdersRouter } from "./routes/serviceOrders";
import { suppliersRouter } from "./routes/suppliers";
import { backupsRouter, dashboardRouter, settingsRouter } from "./routes/system";
import { vehiclesRouter } from "./routes/vehicles";

initDatabase();
startBackupSchedule();

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/clients", clientsRouter);
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/service-orders", serviceOrdersRouter);
app.use("/api/payables", payablesRouter);
app.use("/api/receivables", receivablesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/backups", backupsRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Recurso não encontrado." });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "JSON inválido." });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Erro interno do servidor." });
};

app.use(errorHandler);

const port = Number(process.env.PORT) || 3333;
app.listen(port, () => {
  console.log(`ServiOS API em http://localhost:${port}`);
});
