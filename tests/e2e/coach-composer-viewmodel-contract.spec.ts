import { test, expect } from "@playwright/test";
import { toCoachComposerModel } from "../../src/modules/coach-chat/composerViewModel";

test("coach composer view model exposes render-ready controls", () => {
  const model = toCoachComposerModel({
    input: "My answer",
    selectedImage: { dataUrl: "data:image/jpeg;base64,abc", name: "office.jpg" },
    hydrated: true,
    loading: false,
    listening: true,
  });

  expect(model).toMatchObject({
    input: "My answer",
    selectedImage: {
      name: "office.jpg",
      alt: "office.jpg",
    },
    fileInput: {
      accept: "image/*",
    },
    textarea: {
      disabled: false,
      placeholder: "Escribe tu respuesta en inglés o pide una explicación...",
    },
    imageButton: {
      disabled: false,
      ariaLabel: "Agregar foto para vocabulario",
    },
    microphoneButton: {
      disabled: false,
      ariaLabel: "Detener micrófono",
      icon: "mic",
    },
    sendButton: {
      disabled: false,
      ariaLabel: "Enviar respuesta",
      icon: "send",
    },
  });
});

test("coach composer view model handles loading and unhydrated states", () => {
  expect(
    toCoachComposerModel({
      input: "",
      selectedImage: null,
      hydrated: false,
      loading: false,
      listening: false,
    }),
  ).toMatchObject({
    textarea: { disabled: true },
    imageButton: { disabled: true },
    microphoneButton: { disabled: true, ariaLabel: "Dictar con micrófono" },
    sendButton: { disabled: true, icon: "send" },
  });

  expect(
    toCoachComposerModel({
      input: "",
      selectedImage: null,
      hydrated: true,
      loading: true,
      listening: false,
    }).sendButton,
  ).toMatchObject({
    disabled: false,
    ariaLabel: "Parar respuesta del profesor",
    icon: "stop",
  });
});
