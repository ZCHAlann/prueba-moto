import { useParams } from "react-router";
import { useAuth } from "../../../context/AuthContext";

export default function MotorCockpitPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  return (
    <div>
      <h1>Motor Cockpit</h1>
      <p>Motor ID: {id}</p>
    </div>
  );
}