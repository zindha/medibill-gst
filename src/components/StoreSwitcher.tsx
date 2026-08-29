import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Building2, Check, ChevronsUpDown, Loader2, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function StoreSwitcher() {
  const { activeStore, myStores, isAuthenticated } = useAuth();
  const setActiveStore = useMutation(api.stores.setActiveStore);
  const createStore = useMutation(api.stores.createStore);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState<Id<"stores"> | null>(null);

  if (!isAuthenticated) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createStore({ name: name.trim() });
      toast.success("Store created");
      setName("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create store");
    } finally {
      setCreating(false);
    }
  };

  const handleSwitch = async (storeId: Id<"stores">) => {
    setSwitching(storeId);
    try {
      await setActiveStore({ storeId });
      toast.success("Switched store");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch store");
    } finally {
      setSwitching(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg border border-border bg-card/60 hover:bg-secondary/70 transition-colors text-left cursor-pointer">
            <span className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-foreground truncate">
                {activeStore?.name ?? "Select store"}
              </span>
              {activeStore && (
                <span className="block text-[10px] text-muted-foreground flex items-center gap-1">
                  {activeStore.isOwner ? (
                    <>
                      <ShieldCheck className="h-3 w-3" />
                      Owner
                    </>
                  ) : (
                    "Member"
                  )}
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Your stores</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {myStores?.length === 0 && (
            <DropdownMenuItem disabled>No stores yet</DropdownMenuItem>
          )}
          {myStores?.map((store) => (
            <DropdownMenuItem
              key={store._id}
              onClick={() => handleSwitch(store._id)}
              disabled={switching !== null}
              className="cursor-pointer"
            >
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{store.name}</span>
              {store.active ? (
                <Check className="h-4 w-4 text-primary" />
              ) : switching === store._id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen(true)} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Create new store
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a new store</DialogTitle>
            <DialogDescription>
              Give your new pharmacy or outlet a name. Business details can be
              filled in from the Settings page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="store-name">Store name</Label>
            <Input
              id="store-name"
              placeholder="e.g. Sunrise Pharmacy - Branch 2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}