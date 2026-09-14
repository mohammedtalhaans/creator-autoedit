# Origin UI source notes

The React primitives in `src/components/ui/origin.tsx` adapt the component anatomy and class tokens from the official Origin UI NG repository at commit `d785a610f510f5197a145f8c1a24249309bacd2d`.

Upstream source paths used for the adaptation:

- `packages/components/button/src/button.ts`
- `packages/components/input/src/input.ts`
- `packages/components/textarea/src/textarea.ts`
- `packages/components/select-native/src/select-native.ts`
- `packages/components/slider/src/slider.component.ts`
- `packages/components/stepper/src/stepper.ts`
- `packages/components/tabs/src/tabs.ts`
- `packages/components/dialog/src/dialog.component.ts`
- `apps/origin-ui/src/registry/default/ui/button.ts`
- `apps/origin-ui/src/registry/default/ui/input.ts`
- `apps/origin-ui/src/registry/default/ui/textarea.ts`
- `apps/origin-ui/src/registry/default/ui/select-native.ts`
- `apps/origin-ui/src/registry/default/ui/slider.ts`
- `apps/origin-ui/src/registry/default/ui/stepper.ts`
- `apps/origin-ui/src/registry/default/ui/tabs.ts`
- `apps/origin-ui/src/registry/default/ui/dialog.ts`
- `apps/origin-ui/src/registry/default/components/file-uploads/file-upload-01.ts`
- `apps/origin-ui/src/registry/default/lib/use-file-upload.ts`

The repository is Angular, so this project keeps its React runtime and uses the existing Radix React packages for interaction behavior. No Angular package is installed.
