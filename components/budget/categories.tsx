import { CATEGORY_ICONS } from "@/lib/budget/category-icons";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useBudget } from "@/lib/budget/store";
import {
  type Category,
  type TransactionType,
  PALETTE,
  id,
} from "@/lib/budget/model";
import {
  categoryUsage,
  removeCategory,
  saveCategory,
} from "@/lib/budget/categories";
import { Button, C, Empty, ErrorText, Field, Icon, Sheet, Txt } from "./ui";

export function CategoryManager({
  onClose,
  onDone,
  initialType = "expense",
  startWithNew = false,
  onAdded,
  onRemoved,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
  initialType?: TransactionType;
  startWithNew?: boolean;
  onAdded?: (category: Category) => void;
  onRemoved?: (oldId: string, replacementId?: string) => void;
}) {
  const { data, update } = useBudget();
  const [type, setType] = useState<TransactionType>(initialType);
  const [mode, setMode] = useState<"list" | "form" | "remove">(
    startWithNew ? "form" : "list",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(
    initialType === "income" ? "briefcase" : "tag",
  );
  const [color, setColor] = useState(PALETTE[0]);
  const [replacementId, setReplacementId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const editing = data.categories.find((c) => c.id === editingId);
  const usage = editing ? categoryUsage(data, editing.id) : null;
  const used =
    usage &&
    (usage.transactions > 0 || usage.plans > 0 || usage.budgetMonths > 0);
  const rows = data.categories.filter((c) => c.type === type);
  function back() {
    setMode("list");
    setEditingId(null);
    setError("");
  }
  function edit(category?: Category) {
    setEditingId(category?.id ?? null);
    setName(category?.name ?? "");
    setIcon(category?.icon ?? (type === "income" ? "briefcase" : "tag"));
    setColor(category?.color ?? PALETTE[0]);
    setError("");
    setMode("form");
  }
  async function save() {
    setBusy(true);
    setError("");
    const category: Category = {
      id: editingId ?? id(),
      name,
      type,
      color,
      icon,
    };
    try {
      await update((d) => {
        if (editingId && !d.categories.some((c) => c.id === editingId))
          throw new Error(
            "Kategori başka bir ekranda kaldırılmış. Listeyi yeniden aç.",
          );
        return saveCategory(d, category);
      });
      if (!editingId) onAdded?.(category);
      onDone(editingId ? "Kategori güncellendi." : "Yeni kategori eklendi.");
      if (startWithNew) onClose();
      else back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!editingId) return;
    setBusy(true);
    setError("");
    try {
      await update((d) =>
        removeCategory(d, editingId, replacementId || undefined),
      );
      onRemoved?.(editingId, replacementId || undefined);
      onDone(
        used
          ? "Kategori kaldırıldı; işlemler, planlar ve limitler taşındı."
          : "Kategori kaldırıldı.",
      );
      back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={
        mode === "remove"
          ? "Kategoriyi kaldır"
          : mode === "form"
            ? editingId
              ? "Kategoriyi düzenle"
              : "Yeni kategori"
            : "Kategorileri yönet"
      }
      subtitle="Kategorilerin Google hesabına özeldir ve diğer cihazlarınla eşitlenir."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {mode !== "list" && !startWithNew ? (
        <Button small kind="ghost" disabled={busy} onPress={back}>
          Kategori listesine dön
        </Button>
      ) : null}
      {mode !== "remove" ? (
        <View style={{ flexDirection: "row", gap: 8, marginVertical: 14 }}>
          {(["expense", "income"] as const).map((t) => (
            <Button
              key={t}
              small
              disabled={busy || !!editingId}
              kind={type === t ? "primary" : "secondary"}
              onPress={() => {
                setType(t);
                setIcon((old) =>
                  old === "tag" || old === "briefcase"
                    ? t === "income"
                      ? "briefcase"
                      : "tag"
                    : old,
                );
                setError("");
              }}
              style={{ flex: 1 }}
            >
              {t === "expense" ? "Gider kategorileri" : "Gelir kategorileri"}
            </Button>
          ))}
        </View>
      ) : null}
      {mode === "list" ? (
        <>
          <Button icon="plus" onPress={() => edit()}>
            Yeni kategori ekle
          </Button>
          <Txt style={{ color: C.muted, fontSize: 12, marginVertical: 14 }}>
            Adı, rengi ve simgeyi düzenleyebilirsin. Kullanılmış kategoriyi
            kaldırırken bağlı kayıtlar aynı türde başka bir kategoriye taşınır.
          </Txt>
          {rows.length ? (
            rows.map((category) => {
              const u = categoryUsage(data, category.id);
              return (
                <View
                  key={category.id}
                  style={{
                    gap: 9,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <Icon
                      name={category.icon}
                      color={category.color}
                      size={18}
                    />
                    <Txt bold style={{ flex: 1 }}>
                      {category.name}
                    </Txt>
                  </View>
                  <Txt style={{ color: C.dim, fontSize: 11 }}>
                    {u.transactions} işlem · {u.plans} plan · {u.budgetMonths}{" "}
                    aylık limit
                  </Txt>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    <Button
                      small
                      kind="secondary"
                      accessibilityLabel={`${category.name} kategorisini düzenle`}
                      onPress={() => edit(category)}
                    >
                      Düzenle
                    </Button>
                    <Button
                      small
                      kind="danger"
                      accessibilityLabel={`${category.name} kategorisini kaldır`}
                      onPress={() => {
                        setEditingId(category.id);
                        setReplacementId("");
                        setError("");
                        setMode("remove");
                      }}
                    >
                      Kaldır
                    </Button>
                  </View>
                </View>
              );
            })
          ) : (
            <Empty
              title="Bu türde kategori yok"
              body="Yeni kategori ekleyerek başlayabilirsin."
            />
          )}
        </>
      ) : mode === "form" ? (
        <>
          <Field
            label="Kategori adı"
            value={name}
            onChangeText={setName}
            placeholder="Örn. Eğitim"
            maxLength={40}
            editable={!busy}
          />
          <View
            accessibilityLabel="Kategori önizlemesi"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 14,
              backgroundColor: C.bg,
              borderRadius: 10,
              marginBottom: 18,
            }}
          >
            <Icon name={icon} color={color} size={28} />
            <Txt bold style={{ flex: 1 }}>
              {name.trim() || "Kategori önizlemesi"}
            </Txt>
          </View>
          <Txt bold style={{ marginBottom: 10 }}>
            Kategori simgesi
          </Txt>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Kategori simgesi"
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {[
              ...CATEGORY_ICONS,
              ...(editing &&
              !CATEGORY_ICONS.some((item) => item.name === editing.icon)
                ? [{ name: editing.icon, label: "Mevcut simge" }]
                : []),
            ].map((item) => (
              <Pressable
                key={item.name}
                accessibilityRole="radio"
                accessibilityLabel={`${item.label} simgesini seç`}
                accessibilityState={{
                  checked: icon === item.name,
                  disabled: busy,
                }}
                aria-checked={icon === item.name}
                disabled={busy}
                onPress={() => setIcon(item.name)}
                style={{
                  flexBasis: 64,
                  flexGrow: 1,
                  maxWidth: 104,
                  minHeight: 68,
                  padding: 8,
                  gap: 5,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderRadius: 10,
                  borderColor: icon === item.name ? color : C.border,
                  backgroundColor: icon === item.name ? C.elevated : C.bg,
                }}
              >
                <Icon
                  name={item.name}
                  color={icon === item.name ? color : C.muted}
                  size={23}
                />
                <Txt
                  style={{ fontSize: 10, lineHeight: 14, textAlign: "center" }}
                >
                  {item.label}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Txt bold style={{ marginBottom: 10 }}>
            Kategori rengi
          </Txt>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`${c} renk seç`}
                disabled={busy}
                onPress={() => setColor(c)}
                style={{
                  width: 36,
                  height: 36,
                  backgroundColor: c,
                  borderRadius: 18,
                  borderWidth: 3,
                  borderColor: color === c ? C.text : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {color === c ? (
                  <Icon name="check" size={17} color={C.bg} />
                ) : null}
              </Pressable>
            ))}
          </View>
          {editingId ? (
            <Txt style={{ color: C.dim, fontSize: 11, marginBottom: 12 }}>
              Kategori türü sabittir. Ad, renk ve simge değişikliği mevcut işlem
              ve planlara da yansır.
            </Txt>
          ) : null}
          <ErrorText message={error} />
          <Button busy={busy} onPress={() => void save()}>
            {editingId ? "Kategoriyi kaydet" : "Kategoriyi ekle"}
          </Button>
        </>
      ) : editing ? (
        <>
          <Txt bold style={{ marginTop: 16, marginBottom: 10 }}>
            {editing.name} kategorisi kaldırılacak.
          </Txt>
          <Txt style={{ color: C.muted, marginBottom: 15 }}>
            {usage!.transactions} işlem, {usage!.plans} plan ve{" "}
            {usage!.budgetMonths} aylık limit bağlı. İşlem tutarları, saatleri
            ve döviz karşılıkları korunur.
          </Txt>
          {used ? (
            <>
              <Txt bold style={{ marginBottom: 10 }}>
                Kayıtları taşıyacağın kategori
              </Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {rows
                  .filter((c) => c.id !== editing.id)
                  .map((c) => (
                    <Button
                      key={c.id}
                      small
                      kind={replacementId === c.id ? "secondary" : "ghost"}
                      accessibilityLabel={`${c.name} kategorisine taşı`}
                      disabled={busy}
                      onPress={() => setReplacementId(c.id)}
                    >
                      {c.name}
                    </Button>
                  ))}
              </View>
              <Txt style={{ color: C.amber, fontSize: 12, marginVertical: 15 }}>
                Geçmiş ve gelecek tüm bağlı işlemler/planlar taşınır. Aynı
                aydaki iki kategori limiti toplanır; toplam bütçe değişmez.
                İşlemler silinmez.
              </Txt>
            </>
          ) : (
            <Txt style={{ color: C.muted, marginBottom: 15 }}>
              Bu kategoriye bağlı kayıt yok; doğrudan kaldırılabilir.
            </Txt>
          )}
          {rows.length <= 1 ? (
            <Txt style={{ color: C.amber, marginVertical: 12 }}>
              Bu türde en az bir kategori kalmalı. Önce yeni bir kategori ekle.
            </Txt>
          ) : null}
          <ErrorText message={error} />
          <Button
            kind="danger"
            busy={busy}
            disabled={rows.length <= 1 || (!!used && !replacementId)}
            onPress={() => void remove()}
          >
            {used ? "Taşı ve kategoriyi kaldır" : "Kategoriyi kaldır"}
          </Button>
        </>
      ) : (
        <ErrorText message="Kategori artık bulunamıyor. Listeye dön." />
      )}
    </Sheet>
  );
}
