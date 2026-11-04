import { onlyDigits } from "@shared/format";

type CepResult = { ok: true; address: string } | { ok: false; missing?: boolean };

export const lookupCep = async (zipCode: string): Promise<CepResult | null> => {
  const digits = onlyDigits(zipCode);
  if (digits.length !== 8) return null;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) return { ok: false };
    const data = (await response.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) return { ok: false, missing: true };
    const street = [data.logradouro, data.bairro].filter(Boolean).join(", ");
    const city = [data.localidade, data.uf].filter(Boolean).join("/");
    return { ok: true, address: [street, city].filter(Boolean).join(" — ") };
  } catch {
    return { ok: false };
  }
};
