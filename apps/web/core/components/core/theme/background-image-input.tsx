/**
 * Background image + dim overlay input for the custom theme block.
 * Drag-and-drop image upload (reuses Plane's existing user-asset endpoint
 * which writes to Minio) plus a slider for the surface tint that dims the
 * image so kanban/list cards stay readable.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { useDropzone } from "react-dropzone";
import type { Control } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { ACCEPTED_COVER_IMAGE_MIME_TYPES_FOR_REACT_DROPZONE, MAX_FILE_SIZE } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType } from "@plane/types";
import type { IUserTheme } from "@plane/types";
import { checkURLValidity, getAssetIdFromUrl } from "@plane/utils";
import { FileService } from "@/services/file.service";

type Props = {
  control: Control<IUserTheme>;
};

const DEFAULT_OVERLAY = 0.65;
const fileService = new FileService();

type FieldProps = {
  url: string;
  onChange: (url: string) => void;
};

// Separate component so useDropzone's hooks live at component top-level
// (Controller render functions are not stable hook scopes).
const BackgroundDropzone = observer(function BackgroundDropzone({ url, onChange }: FieldProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { asset_url } = await fileService.uploadUserAsset(
        {
          entity_identifier: "",
          entity_type: EFileAssetType.USER_BACKGROUND,
        },
        file
      );
      onChange(asset_url);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Загружено",
        message: 'Не забудьте нажать «Установить тему», чтобы сохранить.',
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Не удалось загрузить",
        message: error?.toString() ?? "Попробуйте файл поменьше или другой формат.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!url) {
      onChange("");
      return;
    }
    try {
      if (checkURLValidity(url)) {
        await fileService.deleteOldUserAsset(url);
      } else {
        const assetId = getAssetIdFromUrl(url);
        if (assetId) await fileService.deleteUserAsset(assetId);
      }
    } catch {
      // If delete fails (asset already gone or external URL), still unset
      // the form field so the user can re-upload.
    }
    onChange("");
  };

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: (files) => {
      if (files[0]) void handleUpload(files[0]);
    },
    accept: ACCEPTED_COVER_IMAGE_MIME_TYPES_FOR_REACT_DROPZONE,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
    disabled: isUploading,
  });

  return (
    <div className="flex flex-col gap-2">
      {url ? (
        <div className="flex flex-col gap-2">
          <div
            className="relative h-40 w-full overflow-hidden rounded-md border border-subtle-1"
            style={{
              backgroundImage: `url("${url.replace(/"/g, "%22")}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-caption-md text-tertiary" title={url}>
              Картинка загружена
            </span>
            <Button variant="link-danger" size="sm" onClick={handleRemove} disabled={isUploading}>
              Удалить
            </Button>
          </div>
        </div>
      ) : (
        <div
          {...getRootProps({
            className:
              "flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-subtle-1 bg-surface-2 px-3 text-center transition-colors hover:border-accent-primary " +
              (isDragActive ? "border-accent-primary bg-accent-1/10" : ""),
          })}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <span className="text-body-sm text-secondary">Загружается...</span>
          ) : isDragActive ? (
            <span className="text-body-sm text-secondary">Отпустите файл</span>
          ) : (
            <>
              <span className="text-body-sm text-secondary">Перетащите картинку или нажмите</span>
              <span className="text-caption-sm text-tertiary">JPG / PNG / WEBP, до 5 МБ</span>
            </>
          )}
        </div>
      )}
      {fileRejections.length > 0 && (
        <span className="text-caption-md text-danger-primary">
          {fileRejections[0]?.errors[0]?.code === "file-too-large"
            ? "Файл слишком большой (максимум 5 МБ)."
            : "Формат не поддерживается. Используйте JPG, PNG или WEBP."}
        </span>
      )}
    </div>
  );
});

export const CustomThemeBackgroundImageInput = observer(function CustomThemeBackgroundImageInput(props: Props) {
  const { control } = props;
  const currentUrl = useWatch({ control, name: "backgroundImage" }) ?? "";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-subtle-1 bg-surface-1 p-3">
      <h3 className="text-body-sm-medium">Фоновое изображение</h3>
      <p className="text-caption-md text-tertiary">
        Загрузите картинку — она будет показываться позади канбана и списков. Карточки задач остаются непрозрачными,
        поверх картинки накладывается полупрозрачная вуаль для контраста.
      </p>

      <Controller
        control={control}
        name="backgroundImage"
        render={({ field: { value, onChange } }) => (
          <BackgroundDropzone url={(value ?? "").trim()} onChange={onChange} />
        )}
      />

      <Controller
        control={control}
        name="backgroundOverlayAlpha"
        render={({ field: { value, onChange } }) => {
          const v = typeof value === "number" ? value : DEFAULT_OVERLAY;
          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-caption-md text-secondary">
                <span>Прозрачность вуали</span>
                <span className="tabular-nums">{Math.round(v * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.95}
                step={0.05}
                value={v}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full accent-accent-primary"
                disabled={!currentUrl}
              />
              <p className="text-caption-sm text-tertiary">
                0% — картинка видна полностью, 95% — фон почти полностью затемнён.
              </p>
            </div>
          );
        }}
      />
    </div>
  );
});
