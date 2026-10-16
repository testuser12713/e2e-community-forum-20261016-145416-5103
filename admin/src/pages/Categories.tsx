import { useCallback, useEffect, useState } from "react";
import {
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Table,
  TableEmpty,
  TableHead,
  TableLoadingRows,
  TableRow,
  Td,
  Textarea,
  Th,
  Toast,
  ToastRegion,
  type ToastTone,
} from "../components";
import { ApiError, apiFetch } from "../lib/api";

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  thread_count: number;
}

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
}

const EMPTY_FORM: CategoryForm = { name: "", slug: "", description: "" };
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Die Anfrage ist fehlgeschlagen.";
}

function validateForm(form: CategoryForm, editing: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) {
    errors.name = "Bitte einen Namen angeben.";
  }
  if (!editing) {
    const slug = form.slug.trim();
    if (!slug) {
      errors.slug = "Bitte einen Slug angeben.";
    } else if (!SLUG_PATTERN.test(slug)) {
      errors.slug = "Nur Kleinbuchstaben, Ziffern und Bindestriche.";
    }
  }
  return errors;
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);

  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCategories(await apiFetch<Category[]>("/api/categories"));
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setDialog("create");
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
    });
    setFormErrors({});
    setDialog("edit");
  };

  const closeDialog = () => {
    if (saving) return;
    setDialog(null);
  };

  const submit = async () => {
    const errors = validateForm(form, editing !== null);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    const description = form.description.trim() === "" ? null : form.description;
    try {
      if (editing !== null) {
        const updated = await apiFetch<Category>(`/api/admin/categories/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name.trim(), description }),
        });
        setCategories((current) =>
          current.map((category) => (category.id === updated.id ? updated : category)),
        );
        setToast({ tone: "success", message: "Die Kategorie wurde gespeichert." });
      } else {
        const created = await apiFetch<Category>("/api/admin/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            slug: form.slug.trim(),
            description,
          }),
        });
        setCategories((current) => [...current, created]);
        setToast({ tone: "success", message: "Die Kategorie wurde angelegt." });
      }
      setDialog(null);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setFormErrors(error.fields);
      } else {
        setFormErrors({ form: errorMessage(error) });
      }
    } finally {
      setSaving(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length || reordering) return;

    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setCategories(next);
    setReordering(true);
    try {
      const ordered = await apiFetch<Category[]>("/api/admin/categories/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((category) => category.id) }),
      });
      setCategories(ordered);
    } catch (error) {
      setToast({ tone: "danger", message: errorMessage(error) });
      await load();
    } finally {
      setReordering(false);
    }
  };

  const confirmDelete = async () => {
    if (deleting === null) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiFetch<void>(`/api/admin/categories/${deleting.id}`, { method: "DELETE" });
      setCategories((current) => current.filter((category) => category.id !== deleting.id));
      setToast({ tone: "success", message: "Die Kategorie wurde gelöscht." });
      setDeleting(null);
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  const columnCount = 6;

  return (
    <>
      <PageHeader
        title="Kategorien"
        description="Struktur des Forums. Reihenfolge bestimmt die Navigation im Forum."
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            Neue Kategorie
          </Button>
        }
      />

      <Table label="Kategorien" busy={loading}>
        <TableHead>
          <TableRow>
            <Th width={72}>#</Th>
            <Th>Name</Th>
            <Th>Slug</Th>
            <Th>Beschreibung</Th>
            <Th num>Threads</Th>
            <Th>
              <span className="sr-only">Aktionen</span>
            </Th>
          </TableRow>
        </TableHead>
        <tbody>
          {loading ? <TableLoadingRows rows={5} columns={columnCount} /> : null}
          {!loading && loadError !== null ? (
            <TableEmpty
              columns={columnCount}
              title="Kategorien konnten nicht geladen werden"
              description={loadError}
              action={
                <Button variant="secondary" size="sm" onClick={() => void load()}>
                  Erneut versuchen
                </Button>
              }
            />
          ) : null}
          {!loading && loadError === null && categories.length === 0 ? (
            <TableEmpty
              columns={columnCount}
              title="Noch keine Kategorien"
              description="Lege die erste Kategorie an, damit das Forum eine Struktur bekommt."
              action={
                <Button variant="secondary" size="sm" onClick={openCreate}>
                  Neue Kategorie
                </Button>
              }
            />
          ) : null}
          {!loading && loadError === null
            ? categories.map((category, index) => (
                <TableRow key={category.id}>
                  <Td>
                    <div className="stack gap-0">
                      <span className="xs muted tabular">{category.position}</span>
                      <IconButton
                        label="Nach oben"
                        size="sm"
                        disabled={index === 0 || reordering}
                        onClick={() => void move(index, -1)}
                      >
                        <ChevronUpIcon width={16} height={16} />
                      </IconButton>
                      <IconButton
                        label="Nach unten"
                        size="sm"
                        disabled={index === categories.length - 1 || reordering}
                        onClick={() => void move(index, 1)}
                      >
                        <ChevronDownIcon width={16} height={16} />
                      </IconButton>
                    </div>
                  </Td>
                  <Td>
                    <strong>{category.name}</strong>
                  </Td>
                  <Td className="mono muted">{category.slug}</Td>
                  <Td>
                    <span className="muted truncate" style={{ display: "block", maxWidth: 320 }}>
                      {category.description ?? "—"}
                    </span>
                  </Td>
                  <Td num>{category.thread_count}</Td>
                  <Td>
                    <div className="admin-inline-actions">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(category)}>
                        Bearbeiten
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(category);
                        }}
                      >
                        Löschen
                      </Button>
                    </div>
                  </Td>
                </TableRow>
              ))
            : null}
        </tbody>
      </Table>

      <Modal
        open={dialog !== null}
        title="Kategorie"
        onClose={closeDialog}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={saving}>
              Abbrechen
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void submit()}>
              Speichern
            </Button>
          </>
        }
      >
        <div className="stack gap-3">
          <Field label="Name" htmlFor="cat-name" error={formErrors.name}>
            <Input
              id="cat-name"
              value={form.name}
              placeholder="z. B. Security"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field
            label="Slug"
            htmlFor="cat-slug"
            helper="Wird in der URL verwendet. Nur Kleinbuchstaben und Bindestriche."
            error={formErrors.slug}
          >
            <Input
              id="cat-slug"
              className="mono"
              value={form.slug}
              disabled={editing !== null}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
            />
          </Field>
          <Field
            label="Beschreibung"
            htmlFor="cat-desc"
            counter={`${form.description.length}/200`}
            error={formErrors.description}
          >
            <Textarea
              id="cat-desc"
              maxLength={200}
              value={form.description}
              placeholder="Worum geht es in dieser Kategorie?"
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          {formErrors.form ? <p className="helper helper--error">{formErrors.form}</p> : null}
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        title="Kategorie löschen?"
        description="Die Kategorie und ihre Zuordnung werden entfernt. Vorhandene Threads bleiben erhalten und müssen neu zugeordnet werden."
        onClose={() => {
          if (!deleteBusy) setDeleting(null);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Abbrechen
            </Button>
            <Button variant="danger" loading={deleteBusy} onClick={() => void confirmDelete()}>
              Löschen
            </Button>
          </>
        }
      >
        {deleteError !== null ? (
          <p className="helper helper--error">{deleteError}</p>
        ) : null}
      </Modal>

      <ToastRegion>
        {toast !== null ? (
          <Toast tone={toast.tone} onDismiss={() => setToast(null)}>
            {toast.message}
          </Toast>
        ) : null}
      </ToastRegion>
    </>
  );
}
