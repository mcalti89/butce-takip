import { isCategoryIcon } from "./category-icons";
import type { BudgetData, Category } from "./model";
const normalizedName = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
export function categoryUsage(data: BudgetData, categoryId: string) {
  return {
    transactions: data.transactions.filter((t) => t.categoryId === categoryId)
      .length,
    plans: (data.paymentPlans ?? []).filter((p) => p.categoryId === categoryId)
      .length,
    budgetMonths: Object.values(data.budgets).filter((b) =>
      Object.hasOwn(b, categoryId),
    ).length,
  };
}
export function saveCategory(data: BudgetData, category: Category): BudgetData {
  const previous = data.categories.find((c) => c.id === category.id);
  const name = category.name.trim().replace(/\s+/g, " ");
  if (
    !name ||
    name.length > 40 ||
    !["income", "expense"].includes(category.type)
  )
    throw new Error(
      "En fazla 40 karakterlik bir kategori adı ve geçerli tür seç.",
    );
  if (!/^#[a-fA-F0-9]{6}$/.test(category.color))
    throw new Error("Geçerli bir kategori rengi seç.");
  if (previous && previous.type !== category.type)
    throw new Error("Mevcut kategorinin gelir/gider türü değiştirilemez.");
  if (
    data.categories.some(
      (c) =>
        c.id !== category.id &&
        c.type === category.type &&
        normalizedName(c.name) === normalizedName(name),
    )
  )
    throw new Error("Bu isimde bir kategori zaten var.");
  if (category.icon !== previous?.icon && !isCategoryIcon(category.icon))
    throw new Error("Listeden geçerli bir kategori simgesi seç.");
  const next = {
    ...category,
    name,
  };
  return {
    ...data,
    categories: previous
      ? data.categories.map((c) => (c.id === category.id ? next : c))
      : [...data.categories, next],
  };
}
/** Reassign all references atomically; no transaction, installment or limit is discarded. */
export function removeCategory(
  data: BudgetData,
  categoryId: string,
  replacementId?: string,
): BudgetData {
  const category = data.categories.find((c) => c.id === categoryId);
  if (!category)
    throw new Error("Kategori artık bulunamıyor; son verileri yükle.");
  if (data.categories.filter((c) => c.type === category.type).length <= 1)
    throw new Error(
      "Bu türde en az bir kategori kalmalı. Önce yeni bir kategori ekle.",
    );
  const replacement = data.categories.find(
    (c) =>
      c.id === replacementId && c.id !== categoryId && c.type === category.type,
  );
  const usage = categoryUsage(data, categoryId);
  if ((usage.transactions || usage.plans || usage.budgetMonths) && !replacement)
    throw new Error(
      "Kayıtları korumak için aynı türde bir taşıma kategorisi seç.",
    );
  if (replacementId !== undefined && !replacement)
    throw new Error("Aynı türde farklı bir taşıma kategorisi seç.");
  const budgets = Object.fromEntries(
    Object.entries(data.budgets).map(([month, limits]) => {
      if (!Object.hasOwn(limits, categoryId)) return [month, limits];
      const next = { ...limits };
      const amount = next[categoryId];
      delete next[categoryId];
      next[replacement!.id] =
        Math.round(((next[replacement!.id] ?? 0) + amount) * 100) / 100;
      return [month, next];
    }),
  );
  return {
    ...data,
    categories: data.categories.filter((c) => c.id !== categoryId),
    budgets,
    transactions: data.transactions.map((t) =>
      t.categoryId === categoryId ? { ...t, categoryId: replacement!.id } : t,
    ),
    ...(data.paymentPlans
      ? {
          paymentPlans: data.paymentPlans.map((p) =>
            p.categoryId === categoryId
              ? { ...p, categoryId: replacement!.id }
              : p,
          ),
        }
      : {}),
  };
}
