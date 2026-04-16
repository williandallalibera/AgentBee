"use client";

import { useState } from "react";
import { createAdminUser, updateAdminUser } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type UserItem = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export function UserAdminPanel({
  users,
  localMode = false,
}: {
  users: UserItem[];
  localMode?: boolean;
}) {
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  async function onCreateUser() {
    setLoading(true);
    setMessage(null);
    if (localMode) {
      setMessage("Modo local: cadastro desabilitado.");
      setLoading(false);
      return;
    }
    const result = await createAdminUser({
      name: createName,
      email: createEmail,
      password: createPassword,
    });
    setMessage(
      "error" in result && result.error ? result.error : "Usuário criado com sucesso.",
    );
    if (!("error" in result)) {
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      setIsCreateOpen(false);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Perfil único de acesso: admin.</p>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger
            render={<Button disabled={localMode || loading}>Novo usuário</Button>}
          />
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar usuário</DialogTitle>
              <DialogDescription>
                Informe nome, e-mail e senha inicial.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="new-user-name">Nome</Label>
                <Input
                  id="new-user-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Nome completo"
                  disabled={loading || localMode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-email">E-mail</Label>
                <Input
                  id="new-user-email"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  disabled={loading || localMode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-password">Senha</Label>
                <Input
                  id="new-user-password"
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  disabled={loading || localMode}
                />
              </div>
              <Button
                type="button"
                onClick={onCreateUser}
                disabled={loading || localMode}
                className="w-full"
              >
                Criar usuário admin
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            localMode={localMode}
            loading={loading}
            setLoading={setLoading}
            setMessage={setMessage}
          />
        ))}
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      ) : null}

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

function UserCard({
  user,
  localMode,
  loading,
  setLoading,
  setMessage,
}: {
  user: UserItem;
  localMode: boolean;
  loading: boolean;
  setLoading: (value: boolean) => void;
  setMessage: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [newPassword, setNewPassword] = useState("");

  async function onSave() {
    setLoading(true);
    setMessage(null);
    if (localMode) {
      setMessage("Modo local: edição desabilitada.");
      setLoading(false);
      return;
    }
    const result = await updateAdminUser({
      userId: user.id,
      name,
      email,
      newPassword: newPassword || undefined,
    });
    setMessage(
      "error" in result && result.error
        ? result.error
        : "Usuário atualizado com sucesso.",
    );
    if (!("error" in result)) {
      setNewPassword("");
      setOpen(false);
    }
    setLoading(false);
  }

  return (
    <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
      <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
      <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        admin · {new Date(user.createdAt).toLocaleString("pt-BR")}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              disabled={localMode || loading}
            >
              Editar
            </Button>
          }
        />
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>
              Atualize nome, e-mail e, se necessário, defina uma nova senha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`edit-name-${user.id}`}>Nome</Label>
              <Input
                id={`edit-name-${user.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading || localMode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-email-${user.id}`}>E-mail</Label>
              <Input
                id={`edit-email-${user.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || localMode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-password-${user.id}`}>
                Nova senha (opcional)
              </Label>
              <Input
                id={`edit-password-${user.id}`}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={loading || localMode}
              />
            </div>
            <Button
              type="button"
              onClick={onSave}
              disabled={loading || localMode}
              className="w-full"
            >
              Salvar alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
