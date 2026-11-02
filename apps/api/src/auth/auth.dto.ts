import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString() @MaxLength(20) pin: string;
}

export class SetupDto {
  @IsString() @MaxLength(20) pin: string;
  @IsOptional() @IsString() @MaxLength(160) hint?: string;
  @IsOptional() @IsString() @MaxLength(200) setupKey?: string;
}

export class ChangePinDto {
  @IsString() @MaxLength(20) oldPin: string;
  @IsString() @MaxLength(20) newPin: string;
  @IsOptional() @IsString() @MaxLength(160) hint?: string;
}

export class ResetPinDto {
  @IsString() @MaxLength(200) setupKey: string;
  @IsString() @MaxLength(20) newPin: string;
  @IsOptional() @IsString() @MaxLength(160) hint?: string;
}
