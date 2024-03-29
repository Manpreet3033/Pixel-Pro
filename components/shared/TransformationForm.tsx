"use client";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  aspectRatioOptions,
  creditFee,
  defaultValues,
  transformationTypes,
} from "@/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CustomField } from "./CustomField";
import { useEffect, useState, useTransition } from "react";
import { AspectRatioKey, debounce, deepMergeObjects } from "@/lib/utils";
import { updateCredits } from "@/lib/actions/user.action";
import MediaUploader from "./MediaUploader";
import TransformedImage from "./TransformedImage";
import { getCldImageUrl } from "next-cloudinary";
import { addImage, updateImage } from "@/lib/actions/image.actions";
import { useRouter } from "next/navigation";
import { InsufficientCreditsModal } from "./InsufficientCreditsModal";

export const formSchema = z.object({
  title: z.string(),
  aspectRatio: z.string().optional(),
  color: z.string().optional(),
  prompt: z.string().optional(),
  publicId: z.string(),
});

const TransformationForm = ({
  action,
  data = null,
  type,
  userId,
  creditBalance,
  config = null,
}: TransformationFormProps) => {
  const transformationType = transformationTypes[type];
  const [image, setImage] = useState(data);
  const [newTransformation, setNewTransformation] =
    useState<Transformations | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformationConfig, setTransformationConfig] = useState(config);
  const router = useRouter();

  const [isPending, startTransition] = useTransition();

  const initialValues =
    data && action === "Update"
      ? {
          title: data?.title,
          aspectRatio: data?.aspectRation,
          color: data?.color,
          prompt: data?.prompt,
          publicId: data?.publicId,
        }
      : defaultValues;
  // 1. Define your form.
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
  });

  // 2. Define a submit handler.
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    if (data || image) {
      console.log(image);
      const transformationUrl = getCldImageUrl({
        width: image?.width,
        height: image?.height,
        src: image?.publicId,
        ...transformationConfig,
      });
      const imageData = {
        title: values.title,
        publicId: image?.publicId,
        transformation: type,
        width: image?.width,
        height: image?.height,
        config: transformationConfig,
        secureURL: image?.secureURL,
        transformationURL: transformationUrl,
        aspectRatio: values.aspectRatio,
        prompt: values.prompt,
        color: values.color,
      };
      console.log("Image data: " + imageData);

      if (action === "Add") {
        console.log("Going into Add");
        try {
          const newImage = await addImage({
            image: imageData,
            userId: userId,
            path: "/",
          });

          console.log("New image " + newImage);

          if (newImage) {
            form.reset();
            setImage(data);
            router.push(`/transformations/${newImage._id}`);
          }
        } catch (e) {
          console.log(e);
        }
      }
      if (action === "Update") {
        console.log("Going into Update");
        try {
          const updatedImage = await updateImage({
            image: {
              ...imageData,
              _id: data._id,
            },
            userId,
            path: `/transformations/${data._id}`,
          });

          console.log("Updated image " + updatedImage);

          if (updatedImage) {
            router.push(`/transformations/${updatedImage._id}`);
          }
        } catch (e) {
          console.log(e);
        }
      }
    }
    setIsSubmitting(false);
  }

  const onSelectHandler = (
    value: string,
    onChangeField: (value: string) => void
  ) => {
    const imageSize = aspectRatioOptions[value as AspectRatioKey];
    setImage((prev: any) => ({
      ...prev,
      aspectRatio: imageSize.aspectRatio,
      width: imageSize.width,
      height: imageSize.height,
    }));
    setNewTransformation(transformationType.config);
    return onChangeField(value);
  };

  const onInputChangeHandler = (
    fieldName: string,
    value: string,
    type: string,
    onChange: (value: string) => void
  ) => {
    debounce(() => {
      setNewTransformation((prev: any) => ({
        ...prev,
        [type]: {
          ...prev?.[type],
          [fieldName === "prompt" ? "prompt" : "to"]: value,
        },
      }));
      return onChange(value);
    }, 1000);
  };

  const onTransformHandler = async () => {
    setIsTransforming(true);
    setTransformationConfig(
      deepMergeObjects(newTransformation, transformationConfig)
    );
    setNewTransformation(null);
    startTransition(async () => {
      await updateCredits(userId, -1);
    });
  };

  useEffect(() => {
    if (image && (type === "restore" || type === "removeBackground")) {
      setNewTransformation(transformationType.config);
    }
  }, [image, transformationType.config, type]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {creditBalance < Math.abs(creditFee) && <InsufficientCreditsModal />}
        <CustomField
          control={form.control}
          name="title"
          formLabel="imageTitle"
          className="w-full"
          render={({ field }) => <Input {...field} className="input-field" />}
        />

        {type === "fill" && (
          <CustomField
            control={form.control}
            name="aspectRatio"
            formLabel="aspectRatio"
            className="w-full"
            render={({ field }) => (
              <Select
                onValueChange={(value) => {
                  onSelectHandler(value, field.onChange);
                }}
                value={field.value}
              >
                <SelectTrigger className="select-field ">
                  <SelectValue placeholder="Select Size" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(aspectRatioOptions).map((key) => (
                    <SelectItem key={key} value={key} className="select-item">
                      {aspectRatioOptions[key as AspectRatioKey].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}

        {(type === "remove" || type === "recolor") && (
          <div className="prompt-field">
            <CustomField
              control={form.control}
              name="prompt"
              formLabel={
                type === "remove" ? "Object to Remove" : "Object to Recolor"
              }
              className="w-full"
              render={({ field }) => (
                <Input
                  {...field}
                  value={field.value}
                  className="input-field"
                  onChange={(e) => {
                    onInputChangeHandler(
                      "prompt",
                      e.target.value,
                      type,
                      field.onChange
                    );
                  }}
                />
              )}
            />

            {type === "recolor" && (
              <CustomField
                control={form.control}
                name="color"
                formLabel="Replacement Color"
                className="w-full"
                render={({ field }) => (
                  <Input
                    {...field}
                    value={field.value}
                    className="input-field"
                    onChange={(e) => {
                      onInputChangeHandler(
                        "color",
                        e.target.value,
                        "recolor",
                        field.onChange
                      );
                    }}
                  />
                )}
              />
            )}
          </div>
        )}

        <div className="media-uploader-field over">
          <CustomField
            control={form.control}
            name="publicId"
            className="flex size-full flex-col"
            render={({ field }) => (
              <MediaUploader
                onValueChange={field.onChange}
                setImage={setImage}
                publicId={field.value}
                image={image}
                type={type}
              />
            )}
          />
          <TransformedImage
            image={image}
            type={type}
            title={form.getValues().title}
            isTransforming={isTransforming}
            setIsTransforming={setIsTransforming}
            transformationConfig={transformationConfig}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Button
            className="submit-button capitalize"
            type="button"
            disabled={isTransforming || newTransformation === null}
            onClick={onTransformHandler}
          >
            {isTransforming ? "Transforming..." : "Apply Transformation"}
          </Button>
          <Button
            className="submit-button capitalize"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Save Image"}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default TransformationForm;
