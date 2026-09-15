import type postgres from 'postgres';
import type { EndpointRoute, EndpointStore } from '#src/modules/endpoint/index.ts';

type Database = ReturnType<typeof postgres>;

interface EndpointRow {
  id: string;
  egress_adapter: string;
  address: string;
  enabled: boolean;
}

export class PostgresEndpointStore implements EndpointStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async create(endpoint: EndpointRoute): Promise<boolean> {
    const rows = await this.#db<{ id: string }[]>`
      INSERT INTO endpoints (id, egress_adapter, address, enabled)
      VALUES (
        ${endpoint.endpointId},
        ${endpoint.egressAdapter},
        ${endpoint.address},
        ${endpoint.enabled}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    return rows.length === 1;
  }

  async findById(endpointId: string): Promise<EndpointRoute | undefined> {
    const rows = await this.#db<EndpointRow[]>`
      SELECT id, egress_adapter, address, enabled
      FROM endpoints
      WHERE id = ${endpointId}
    `;
    const row = rows[0];
    return row ? toRoute(row) : undefined;
  }

  async update(endpoint: EndpointRoute): Promise<boolean> {
    const rows = await this.#db<{ id: string }[]>`
      UPDATE endpoints
      SET egress_adapter = ${endpoint.egressAdapter},
          address = ${endpoint.address},
          enabled = ${endpoint.enabled}
      WHERE id = ${endpoint.endpointId}
      RETURNING id
    `;
    return rows.length === 1;
  }
}

function toRoute(row: EndpointRow): EndpointRoute {
  return {
    endpointId: row.id,
    egressAdapter: row.egress_adapter,
    address: row.address,
    enabled: row.enabled,
  };
}
