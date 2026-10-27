// Nur für die Typprüfung mit tsc unter Node. Die Deno-Laufzeit liefert die echten Typen.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
