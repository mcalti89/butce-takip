import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFxRate, fetchLatestFx, fxApiUrl } from "../lib/budget/fxApi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("FX API istemcisi", () => {
  it("en son oran endpoint'ini çağırıp PDO sayı dizelerini doğrulanmış kur tipine çevirir", async () => {
    vi.stubEnv("EXPO_PUBLIC_FX_API_URL", "https://api.example.test/fx-api.php");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            date: "2026-10-21",
            source: "TCMB",
            rates: [
              {
                rate_date: "2026-10-21",
                currency_code: "USD",
                currency_name: "ABD doları",
                unit: 1,
                forex_buying: "49.51230000",
                forex_selling: "49.60150000",
                banknote_buying: "49.47760000",
                banknote_selling: "49.67590000",
                bulletin_no: "2026/199",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const result = await fetchLatestFx(["USD"]);
    expect(result.date).toBe("2026-10-21");
    expect(result.rates[0].forexSelling).toBe(49.6015);
    expect(result.rates[0].currency).toBe("USD");
  });

  it("işlem gününde veya öncesinde yayınlanan son kur snapshot'ını getirir", async () => {
    vi.stubEnv("EXPO_PUBLIC_FX_API_URL", "https://api.example.test/fx-api.php");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            source: "TCMB",
            rate: {
              rate_date: "2026-10-21",
              currency_code: "JPY",
              currency_name: "Japon yeni",
              unit: "100",
              forex_buying: "31.2440",
              forex_selling: "31.4509",
              bulletin_no: "2026/199",
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await fetchFxRate("JPY", "2026-10-22");
    expect(result.rate.unit).toBe(100);
    expect(result.rate.date).toBe("2026-10-21");
  });

  it("API alan adı bağlanmadıysa gerçek bir kur varmış gibi yanıt vermez", async () => {
    vi.stubEnv("EXPO_PUBLIC_FX_API_URL", "");
    await expect(fetchLatestFx(["USD"])).rejects.toThrow(
      "kur API adresi gerekli",
    );
  });
});

it("web istemcisi varsayılan olarak aynı kökendeki FX API kullanır", () => {
  vi.stubEnv("EXPO_PUBLIC_FX_API_URL", "");
  vi.stubGlobal("window", {});
  expect(fxApiUrl()).toBe("/api/fx");
});
