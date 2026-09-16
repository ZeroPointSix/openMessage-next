import type postgres from 'postgres';
import type {
  EndpointRoute,
  EndpointStore,
  UpdateEndpointCommand,
} from '#src/modules/endpoint/index.ts';

type Database = ReturnType<typeof postgres>;

interface EndpointRow {
  id: string;
  egress_adapter: string;
  address: string;
  enabled: boolean;
  headers: Record<string, string>;
}

export class PostgresEndpointStore implements EndpointStore {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async create(endpoint: EndpointRoute): Promise<boolean> {
    const rows = await this.#db<{ id: string }[]>`
      INSERT INTO endpoints (id, egress_adapter, address, enabled, headers)
      VALUES (
        ${endpoint.endpointId}, ${endpoint.egressAdapter}, ${endpoint.address}, ${endpoint.enabled},
        ${this.#db.json(endpoint.headers ?? {})}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    return rows.length === 1;
  }

  async findById(endpointId: string): Promise<EndpointRoute | undefined> {
    const rows = await this.#db<EndpointRow[]>`
      SELECT id, egress_adapter, address, enabled, headers FROM endpoints WHERE id = ${endpointId}
    `;
    return rows[0] ? toRoute(rows[0]) : undefined;
  }

  async update(command: UpdateEndpointCommand): Promise<EndpointRoute | undefined> {
    const headers = command.headers === undefined ? null : this.#db.json(command.headers);
    const rows = await this.#db<EndpointRow[]>`
      UPDATE endpoints
      SET egress_adapter = COALESCE(${command.egressAdapter ?? null}, egress_adapter),
          address = COALESCE(${command.address ?? null}, address),
          enabled = COALESCE(${command.enabled ?? null}, enabled),
          headers = COALESCE(${headers}, headers)
      WHERE id = ${command.endpointId}
      RETURNING id, egress_adapter, address, enabled, headers
    `;
    return rows[0] ? toRoute(rows[0]) : undefined;
  }
}

function toRoute(row: EndpointRow): EndpointRoute {
  const headers = row.headers ?? {};
  return {
    endpointId: row.id,
    egressAdapter: row.egress_adapter,
    address: row.address,
    enabled: row.enabled,
    ...(Object.keys(headers).length === 0 ? {} : { headers }),
  };
}
