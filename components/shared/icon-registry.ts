import type { FC, SVGProps } from "react";
import { AlertTriangle } from "@untitledui/icons/AlertTriangle";
import { Brush01 } from "@untitledui/icons/Brush01";
import { Calendar } from "@untitledui/icons/Calendar";
import { Check } from "@untitledui/icons/Check";
import { ChevronDown } from "@untitledui/icons/ChevronDown";
import { ChevronLeft } from "@untitledui/icons/ChevronLeft";
import { ChevronRight } from "@untitledui/icons/ChevronRight";
import { Clock } from "@untitledui/icons/Clock";
import { ClockRewind } from "@untitledui/icons/ClockRewind";
import { Coins01 } from "@untitledui/icons/Coins01";
import { Colors } from "@untitledui/icons/Colors";
import { Columns02 } from "@untitledui/icons/Columns02";
import { Crop01 } from "@untitledui/icons/Crop01";
import { Database01 } from "@untitledui/icons/Database01";
import { DotsHorizontal } from "@untitledui/icons/DotsHorizontal";
import { Download01 } from "@untitledui/icons/Download01";
import { Edit01 } from "@untitledui/icons/Edit01";
import { Expand01 } from "@untitledui/icons/Expand01";
import { FilterFunnel02 } from "@untitledui/icons/FilterFunnel02";
import { FlipBackward } from "@untitledui/icons/FlipBackward";
import { FlipForward } from "@untitledui/icons/FlipForward";
import { Folder } from "@untitledui/icons/Folder";
import { Grid01 } from "@untitledui/icons/Grid01";
import { Heart } from "@untitledui/icons/Heart";
import { Image01 } from "@untitledui/icons/Image01";
import { Image05 } from "@untitledui/icons/Image05";
import { Lightbulb03 } from "@untitledui/icons/Lightbulb03";
import { LinkExternal01 } from "@untitledui/icons/LinkExternal01";
import { Lock01 } from "@untitledui/icons/Lock01";
import { LockUnlocked01 } from "@untitledui/icons/LockUnlocked01";
import { LogOut01 } from "@untitledui/icons/LogOut01";
import { Mail01 } from "@untitledui/icons/Mail01";
import { Minus } from "@untitledui/icons/Minus";
import { Paperclip } from "@untitledui/icons/Paperclip";
import { Plus } from "@untitledui/icons/Plus";
import { Reflect01 } from "@untitledui/icons/Reflect01";
import { Reflect02 } from "@untitledui/icons/Reflect02";
import { RefreshCcw01 } from "@untitledui/icons/RefreshCcw01";
import { RefreshCw01 } from "@untitledui/icons/RefreshCw01";
import { SearchMd } from "@untitledui/icons/SearchMd";
import { Send01 } from "@untitledui/icons/Send01";
import { Settings01 } from "@untitledui/icons/Settings01";
import { Sliders04 } from "@untitledui/icons/Sliders04";
import { Star01 } from "@untitledui/icons/Star01";
import { Star04 } from "@untitledui/icons/Star04";
import { Stop } from "@untitledui/icons/Stop";
import { Sun } from "@untitledui/icons/Sun";
import { Trash04 } from "@untitledui/icons/Trash04";
import { XClose } from "@untitledui/icons/XClose";

type UntitledIconComponent = FC<
  SVGProps<SVGSVGElement> & { color?: string; size?: number }
>;

/** Icons referenced anywhere in the app — add here when introducing a new Icon name. */
export const ICON_COMPONENTS = {
  AlertTriangle,
  Brush01,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ClockRewind,
  Coins01,
  Colors,
  Columns02,
  Crop01,
  Database01,
  DotsHorizontal,
  Download01,
  Edit01,
  Expand01,
  FilterFunnel02,
  FlipBackward,
  FlipForward,
  Folder,
  Grid01,
  Heart,
  Image01,
  Image05,
  Lightbulb03,
  LinkExternal01,
  Lock01,
  LockUnlocked01,
  LogOut01,
  Mail01,
  Minus,
  Paperclip,
  Plus,
  Reflect01,
  Reflect02,
  RefreshCcw01,
  RefreshCw01,
  SearchMd,
  Send01,
  Settings01,
  Sliders04,
  Star01,
  Star04,
  Stop,
  Sun,
  Trash04,
  XClose,
} as const satisfies Record<string, UntitledIconComponent>;

export type IconName = keyof typeof ICON_COMPONENTS;

/** @internal Used by scripts/verify-icon-registry.mjs */
export const ICON_NAMES = ["AlertTriangle","Brush01","Calendar","Check","ChevronDown","ChevronLeft","ChevronRight","Clock","ClockRewind","Coins01","Colors","Columns02","Crop01","Database01","DotsHorizontal","Download01","Edit01","Expand01","FilterFunnel02","FlipBackward","FlipForward","Folder","Grid01","Heart","Image01","Image05","Lightbulb03","LinkExternal01","Lock01","LockUnlocked01","LogOut01","Mail01","Minus","Paperclip","Plus","Reflect01","Reflect02","RefreshCcw01","RefreshCw01","SearchMd","Send01","Settings01","Sliders04","Star01","Star04","Stop","Sun","Trash04","XClose"] as const;
