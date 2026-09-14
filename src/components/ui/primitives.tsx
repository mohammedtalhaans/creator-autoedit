/**
 * Compatibility entry point for the editor and recording surfaces. New code
 * should import from `./origin`; keeping this re-export avoids two competing
 * control systems while the phone flow is migrated.
 */
export {
    Alert,
    Badge,
    BottomSheet,
    Button,
    Card,
    Dialog,
    Field,
    FileUpload,
    IconButton,
    Input,
    Modal,
    NativeSelect,
    OriginButton,
    Segmented,
    Slider,
    Stepper,
    Switch,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Textarea,
    Tooltip,
    originButtonVariants
} from './origin';
export type { OriginButtonProps, OriginButtonSize, OriginButtonVariant } from './origin';
